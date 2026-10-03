/* npm start: uruchamia okno Electrona. Przez ten skrypt, a nie wprost
   „electron .", bo terminal VS Code ustawia ELECTRON_RUN_AS_NODE=1 i wtedy
   Electron udaje zwykłego Node'a — okno się nie otwiera, a main.js pada
   na imporcie z „electron". */
import { spawn } from "node:child_process";
import electron from "electron";

const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const p = spawn(electron, ["."], {stdio: "inherit", env});
p.on("exit", kod => process.exit(kod ?? 0));
