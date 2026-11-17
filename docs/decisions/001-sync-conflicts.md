# ADR 001: konflikty w częściowym batchu

Status: proponowana do przeglądu. Kontekst: jeden push zawiera do 100 niezależnych operacji, z których część może zakończyć się poprawnie.

Decyzja: dla poprawnej strukturalnie paczki konflikt rewizji pojedynczej operacji jest wynikiem `conflict` w `results`; kod szczegółowy `revision_conflict`. HTTP 409 dotyczy konfliktu całego żądania/protokołu. Nie interpretować HTTP 200 jako sukcesu całego batcha.

Konsekwencje: klient analizuje wynik każdej operacji; zastosowane operacje i ich receipts pozostają trwałe. Serwer nie zwraca danych innego właściciela. Kolejność zdarzeń według przyjęcia przez serwer pozostaje propozycją wymagającą walidacji w LEARN-01.
