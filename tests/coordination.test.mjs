import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { apply, transact } from "../scripts/coordinate.mjs";

test("dependency and ownership checks protect tasks", () => {
  const state = { version: 1, tasks: {} };
  assert.throws(() =>
    apply(state, "claim", { id: "DATA-01", owner: "agent1" }),
  );
  const claim = apply(state, "claim", {
    id: "CORE-01",
    owner: "agent1",
    base: "abc",
  });
  assert.throws(() =>
    apply(state, "claim", { id: "CORE-01", owner: "agent2" }),
  );
  assert.throws(() =>
    apply(state, "release", {
      id: "CORE-01",
      owner: "agent2",
      token: claim.token,
    }),
  );
  assert.throws(() =>
    apply(state, "review", {
      id: "CORE-01",
      owner: "agent1",
      token: claim.token,
    }),
  );
  assert.equal(
    apply(state, "release", {
      id: "CORE-01",
      owner: "agent1",
      token: claim.token,
    }).status,
    "TODO",
  );
});

test("two processes racing for one task cannot both claim it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recallio-registry-"));
  try {
    const moduleUrl = new URL("../scripts/coordinate.mjs", import.meta.url)
      .href;
    const run = (owner) =>
      new Promise((resolve) => {
        const source = `import {transact,apply} from ${JSON.stringify(moduleUrl)}; try {await transact(process.argv[1], s=>apply(s,'claim',{id:'CORE-01',owner:process.argv[2]}));process.exit(0)} catch {process.exit(1)}`;
        const child = spawn(process.execPath, [
          "--input-type=module",
          "-e",
          source,
          dir,
          owner,
        ]);
        child.on("exit", (code) => resolve(code));
      });
    const results = await Promise.all([run("agent1"), run("agent2")]);
    assert.deepEqual(results.sort(), [0, 1]);
    const state = await transact(dir, (s) => apply(s, "status"));
    assert.equal(state.find((t) => t.id === "CORE-01").status, "IN_PROGRESS");
    assert.equal(state.find((t) => t.id === "DATA-01").ready, false);
    await mkdir(join(dir, "registry.lock"));
    await assert.rejects(
      transact(dir, () => {}),
      /zablokowany/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
