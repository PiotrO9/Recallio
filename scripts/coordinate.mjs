import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const definitions = {
  "CORE-01": [],
  "DATA-01": ["CORE-01"],
  "LOCAL-01": ["CORE-01"],
  "LEARN-01": ["CORE-01"],
  "PLATFORM-01": ["CORE-01"],
  "CSV-01": ["CORE-01"],
  "LEARN-02": ["LEARN-01"],
  "AUTH-01": ["DATA-01", "LOCAL-01"],
  "SYNC-01": ["DATA-01", "AUTH-01", "LEARN-02"],
  "SYNC-02": ["LOCAL-01", "SYNC-01"],
  "VERTICAL-01": ["PLATFORM-01", "AUTH-01", "SYNC-02", "LEARN-02"],
  "DECK-01": ["LOCAL-01", "AUTH-01", "SYNC-02"],
  "IMPORT-01": ["CSV-01", "DECK-01", "SYNC-02", "VERTICAL-01"],
  "TRAIN-01": ["LEARN-02", "VERTICAL-01", "DECK-01"],
  "PLATFORM-02": ["VERTICAL-01", "PLATFORM-01"],
  "UX-01": ["TRAIN-01", "IMPORT-01", "PLATFORM-02"],
  "RELEASE-01": ["UX-01"],
};

export function registryDirectory(cwd = process.cwd()) {
  const gitDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8" },
  ).trim();
  return join(gitDir, "recallio-coordination");
}

export async function transact(directory, operation) {
  await mkdir(directory, { recursive: true });
  const lock = join(directory, "registry.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Rejestr jest zablokowany. Spróbuj ponownie; nie usuwaj blokady bez sprawdzenia integratora.",
      );
    throw error;
  }
  try {
    const path = join(directory, "registry.json");
    let state;
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = { version: 1, tasks: {} };
    }
    if (state.version !== 1 || !state.tasks || typeof state.tasks !== "object")
      throw new Error("Nieprawidłowy rejestr — przerwano bez zmian.");
    const result = operation(state);
    const tmp = join(directory, `registry-${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", {
        flag: "wx",
      });
      await rename(tmp, path);
    } finally {
      await rm(tmp, { force: true });
    }
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function apply(state, action, options = {}) {
  const tasks = state.tasks;
  const status = (id) => tasks[id]?.status ?? "TODO";
  const ready = (id) =>
    status(id) === "TODO" &&
    definitions[id].every((dep) => status(dep) === "DONE");
  if (action === "status")
    return Object.keys(definitions).map((id) => {
      const { token, ...publicTask } = tasks[id] ?? {};
      return {
        id,
        dependencies: definitions[id],
        ...publicTask,
        status: status(id),
        ready: ready(id),
      };
    });
  const { owner, id } = options;
  if (!owner || !/^[a-zA-Z0-9_-]{2,64}$/.test(owner))
    throw new Error("Podaj unikalnego właściciela: --owner <nazwa>.");
  if (action === "claim") {
    if (id && !Object.hasOwn(definitions, id))
      throw new Error("Nieznane zadanie.");
    const selected = id || Object.keys(definitions).find(ready);
    if (!selected || !ready(selected))
      throw new Error(
        "Brak dostępnego zadania lub jego zależności nie są DONE.",
      );
    if (
      Object.values(tasks).some(
        (t) =>
          t.owner === owner &&
          ["IN_PROGRESS", "REVIEW", "BLOCKED"].includes(t.status),
      )
    )
      throw new Error("Właściciel ma już aktywne zadanie.");
    const token = randomUUID();
    tasks[selected] = {
      status: "IN_PROGRESS",
      owner,
      token,
      base: options.base,
      branch: null,
      worktree: null,
      updatedAt: new Date().toISOString(),
    };
    return { id: selected, ...tasks[selected] };
  }
  if (!id || !tasks[id])
    throw new Error("Nieznane lub niezarezerwowane zadanie.");
  const task = tasks[id];
  if (task.owner !== owner || !options.token || task.token !== options.token)
    throw new Error("Nieprawidłowy właściciel lub token zadania.");
  if (action === "attach" && task.status === "IN_PROGRESS") {
    if (!options.branch || !options.worktree)
      throw new Error("Podaj branch i worktree.");
    task.branch = options.branch;
    task.worktree = options.worktree;
  } else if (action === "review" && task.status === "IN_PROGRESS") {
    if (!options.commit || !options.report || !task.worktree)
      throw new Error("Podaj commit, raport i przypisz worktree.");
    task.status = "REVIEW";
    task.commit = options.commit;
    task.report = options.report;
  } else if (action === "block" && task.status === "IN_PROGRESS") {
    if (!options.reason) throw new Error("Podaj powód blokady.");
    task.status = "BLOCKED";
    task.reason = options.reason;
  } else if (action === "resume" && task.status === "BLOCKED") {
    task.status = "IN_PROGRESS";
    delete task.reason;
  } else if (action === "rework" && task.status === "REVIEW") {
    if (!options.commit || options.commit !== task.commit)
      throw new Error("Podaj aktualny commit zgłoszony do przeglądu.");
    task.previousReview = { commit: task.commit, report: task.report };
    task.status = "IN_PROGRESS";
    delete task.commit;
    delete task.report;
  } else if (
    action === "release" &&
    ["IN_PROGRESS", "BLOCKED"].includes(task.status)
  ) {
    delete tasks[id];
    return { id, status: "TODO" };
  } else {
    throw new Error(
      "Niedozwolone przejście statusu. DONE ustawia wyłącznie integrator po integracji.",
    );
  }
  task.updatedAt = new Date().toISOString();
  return { id, ...task };
}

export function verifyIntegrated(cwd, commit) {
  if (!/^[0-9a-f]{40,64}$/i.test(commit || ""))
    throw new Error("Podaj pełny hash zintegrowanego commita.");
  execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
    cwd,
    stdio: "ignore",
  });
}

export function done(state, id, commit, cwd) {
  const task = state.tasks[id];
  if (!task || task.status !== "REVIEW")
    throw new Error("Zadanie nie oczekuje na przegląd.");
  if (task.commit !== commit)
    throw new Error("Commit nie zgadza się z raportem zadania.");
  verifyIntegrated(cwd, commit);
  task.status = "DONE";
  task.integratedCommit = commit;
  task.updatedAt = new Date().toISOString();
  return { id, ...task };
}

export function optionsFrom(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !args[i].startsWith("--") ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Argumenty muszą mieć postać --nazwa wartość.");
    options[args[i].slice(2)] = args[i + 1];
  }
  return options;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  try {
    const action = process.argv[2];
    const options = optionsFrom(process.argv.slice(3));
    const cwd = process.cwd();
    const directory = registryDirectory(cwd);
    if (action === "claim")
      options.base = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        cwd,
      }).trim();
    const result = await transact(directory, (state) =>
      action === "done"
        ? done(state, options.id, options.commit, cwd)
        : apply(state, action, options),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
