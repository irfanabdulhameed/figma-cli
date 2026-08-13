# Agent Board: Figma-Kommentar-Kanban mit Mensch + Agent

**Datum:** 2026-06-10
**Datei:** `examples/agent-board.js` (ein Node-Script, keine CLI-Änderungen)

## Idee

Ein Kanban-Board im Figma-Canvas, gebaut aus (simulierten) Figma-Kommentaren.
Menschen und Agents bedienen dasselbe Board mit derselben Mechanik: Cards ziehen.
Delegation an den Agent = Card in die Spalte "Agent Queue" ziehen. Ein Watcher-Script
erkennt das, spawnt einen echten `claude -p` Agent, der den Task via figma-cli ausführt,
und bewegt die Card durch In Progress nach Done.

## Befehle

| Befehl | Funktion |
|---|---|
| `node examples/agent-board.js create` | Board in Figma rendern (legt shadcn-Variablen an, falls fehlend) |
| `node examples/agent-board.js watch` | Watcher: pollt Agent Queue alle 4s, arbeitet Tasks sequenziell ab |
| `node examples/agent-board.js watch --once` | Ein Poll-Zyklus (zum Testen) |
| `node examples/agent-board.js delegate <task-id>` | Card per CLI in die Agent Queue schieben (statt Drag) |

## Board-Struktur (Figma)

- Root-Frame `Comment Tracker` (flex row), gerendert mit `--keep-wrapper`
- 4 Spalten-Frames: `col:todo`, `col:agent`, `col:inprogress`, `col:done`
  (Header + Cards als direkte Children, dadurch funktioniert natives Drag & Drop)
- Cards heißen `task:<id>`; feste Child-Reihenfolge: Tag-Chip, Titel-Text,
  Beschreibungs-Text, Footer (Assignee-Chip). Watcher liest Titel/Beschreibung positionsbasiert.
- Alle Farben an shadcn-Variablen gebunden (`var:card`, `var:border`, `var:foreground`,
  `var:muted`, `var:muted-foreground`, `var:primary`)
- 6 Demo-Tasks im Stil des LinkedIn-Screenshots (Tokens, Kontrast, Naming, Button-Variants)

## Watcher-Loop

1. Read-only `figma-cli eval --file` Poll: Cards in `col:agent` als JSON
2. Pro Card (sequenziell, eine nach der anderen):
   - Card → `col:inprogress`, Badge "Agent working…" (amber)
   - `claude -p <prompt>` spawnen (`--allowedTools "Bash(figma-cli:*)"`, Timeout 5 min,
     überschreibbar via env `AGENT_CMD` zum Testen)
   - Prompt: Task-Titel + Beschreibung, Anweisung das Ergebnis NEBEN dem Board zu
     erstellen und das Board selbst nicht anzufassen
   - Erfolg → Card nach `col:done`, Badge "Done by Agent" (grün)
   - Fehler/Timeout → Card zurück nach `col:todo`, Badge "Failed" (rot)
3. Menschen-Cards (alle anderen Spalten) werden vom Watcher nie berührt
4. Ctrl-C beendet sauber

## Bewusste Entscheidungen

- Spaltenzugehörigkeit = Figma-Parent (kein Sidecar-State, Board ist die Wahrheit)
- Sequenzielle Abarbeitung (keine parallelen Daemon-Writes)
- Keine Spalten-Zähler (würden nach Drags veralten)
- Simulierte Kommentar-Daten; Figma REST API (echte Kommentare) als späterer Ausbau
