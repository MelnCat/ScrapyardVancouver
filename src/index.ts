import { dlopen, FFIType, suffix } from "bun:ffi";
import { getImpliedNodeFormatForFile } from "typescript";
import { GlobalKeyboardListener } from "node-global-key-listener";
import mouseEvents from "global-mouse-events";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, sha, ShellPromise } from "bun";
import { setWallpaper } from "wallpaper";

let data: {
	known: Record<number, { name: string; icon: string }>;
} = fs.existsSync("./data.json")
	? JSON.parse(fs.readFileSync("./data.json", "utf8"))
	: {
			known: {},
	  };

const { i32, void: tVoid } = FFIType;

const sWidth = 1920 - 77;
const sHeight = 1030 - 50;

const lib = dlopen(`win.${suffix}`, {
	setup: {
		returns: tVoid,
	},
	getIconCount: {
		returns: i32,
	},
	getIconX: {
		args: [i32],
		returns: i32,
	},
	getIconY: {
		args: [i32],
		returns: i32,
	},
	setIconPos: {
		args: [i32, i32, i32],
	},
	refreshFolder: {
		args: [FFIType.cstring],
	},
	setBackground: {
		args: [FFIType.cstring],
	},
	getIconText: {
		args: [i32],
		returns: FFIType.cstring,
	},
	getIndex: {
		args: [FFIType.cstring],
		returns: i32,
	},
	refreshDesktop: {},
} as const);

lib.symbols.setup();

const n = lib.symbols.getIconCount();

console.log([...Array(n)].map((_, i) => [lib.symbols.getIconX(i), lib.symbols.getIconY(i)]));

const v = new GlobalKeyboardListener();
let [px, py] = [500, 500];
const keys = new Set<string>();
v.addListener(function (e, down) {
	if (down[e.name!]) keys.add(e.name!);
	else keys.delete(e.name!);
});
setInterval(() => {
	const dx = (keys.has("LEFT ARROW") ? -20 : 0) + (keys.has("RIGHT ARROW") ? 20 : 0);
	const dy = (keys.has("UP ARROW") ? -20 : 0) + (keys.has("DOWN ARROW") ? 20 : 0);
	px += dx;
	py += dy;
	px = Math.min(sWidth, Math.max(0, px));
	py = Math.min(sHeight, Math.max(0, py));
}, 20);

mouseEvents.on("mousemove", event => {
	px = event.x;
	py = event.y;
});

mouseEvents.on("mousedown", event => {});

const desktopFolder = (p: string) => path.join(os.homedir(), `./Desktop/${p}/`);
const textureFolder = (p: string) => path.join(fileURLToPath(import.meta.url), `../../icons/${p}.ico`);
const setBackground = (b: string, fast: boolean = false) =>
	fast
		? lib.symbols.setBackground(
				new TextEncoder().encode(path.join(fileURLToPath(import.meta.url), `../../backgrounds/${b}.png`))
		  )
		: setWallpaper(path.join(fileURLToPath(import.meta.url), `../../backgrounds/${b}.png`));

const ensureIcon = async (name: string, icon: string) => {
	const ix = getIndex(name);
	if (ix !== -1) return ix;
	let old = lib.symbols.getIconCount();
	fs.mkdirSync(desktopFolder(name));
	fs.writeFileSync(
		path.join(desktopFolder(name), "./desktop.ini"),
		`[.ShellClassInfo]
		IconResource=${textureFolder(icon)},0
		[ViewState]
		Mode=
		Vid=
		FolderType=Generic`
	);
	//await sleep(100);
	lib.symbols.refreshDesktop();
	lib.symbols.refreshFolder(new TextEncoder().encode(desktopFolder(name)));
};
const ensureIcons = async (icons: { name: string; icon: string }[]) => {
	const remaining = icons.filter(x => getIndex(x.name) === -1);
	for (const icon of remaining) {
		fs.mkdirSync(desktopFolder(icon.name));
		fs.writeFileSync(
			path.join(desktopFolder(icon.name), "./desktop.ini"),
			`[.ShellClassInfo]
IconResource=${textureFolder(icon.icon)},0
[ViewState]
Mode=
Vid=
FolderType=Generic`
		);
		lib.symbols.refreshFolder(new TextEncoder().encode(desktopFolder(icon.name)));
	}
	lib.symbols.refreshDesktop();
	cache = {};
};

const hideAll = () => {
	for (let i = 0; i < lib.symbols.getIconCount(); i++) {
		lib.symbols.setIconPos(i, -100, -100);
	}
};
let cache: Record<string, number> = {};

const sleep = (t: number) => new Promise<void>(res => setTimeout(() => res(), t));
const textEncoder = new TextEncoder();
const getIndex = (name: string) =>
	name in cache ? cache[name]! : (cache[name] = lib.symbols.getIndex(textEncoder.encode(name)));
const setIconPos = (name: string, x: number, y: number) => {
	const i = getIndex(name);
	if (i < 0) return;
	lib.symbols.setIconPos(i, x, y);
};
console.log("SECOND", lib.symbols.getIconCount());
const getAllNames = () => [...Array(lib.symbols.getIconCount())].map((_, i) => lib.symbols.getIconText(i).toString());
getAllNames();
console.log(getAllNames());
const MAX_HEALTH = 100;
let health = 100;
let healthinit = false;
const tickHealth = async () => {
	if (health < 0) return lose();
	const WIDTH = 10;
	if (!healthinit)
		await ensureIcons(
			[...Array(WIDTH)]
				.map((_, i) => [
					{ name: `health${i}`, icon: `health${i === 0 ? "left" : i === WIDTH - 1 ? "right" : "middle"}` },
					{ name: `fhealth${i}`, icon: `fhealth${i === 0 ? "left" : i === WIDTH - 1 ? "right" : "middle"}` },
				])
				.flat()
		);

	for (let i = 0; i < WIDTH; i++) {
		if (!healthinit) setIconPos(`health${i}`, 100 + 60 * i, sHeight - 100);
		if (i / WIDTH <= health / MAX_HEALTH) {
			if (!healthinit) setIconPos(`fhealth${i}`, 100 + 60 * i, sHeight - 100);
		} else setIconPos(`fhealth${i}`, -100, -100);
	}
	healthinit = true;
};
const lose = async () => {
	hideAll();
	await setBackground("lose");
	setTimeout(() => {
		hideAll();
		process.exit();
	}, 500);
};

await ensureIcons([...Array(30)].map((x, i) => ({ name: `ohno${i}`, icon: "white" })));

hideAll();
setBackground("black");
tickHealth(); 
await sleep(1000);
await setBackground("eye1");
await sleep(400);
await setBackground("eye2");
await sleep(400);
await setBackground("eye3");
await sleep(1000);
await setBackground("eyespeak1");
await sleep(2000);
setBackground("eye3");
await sleep(1000);
await setBackground("eyespeak2");
await sleep(3000);
await setBackground("eyespeak3");
await sleep(3000);
await setBackground("eye3");
await sleep(1000);


await sleep(1000);
function isPointInAABB(point: { x: number; y: number }, aabb: { minX: number; maxX: number; minY: number; maxY: number }) {
	const { x, y } = point;
	const { minX, minY, maxX, maxY } = aabb;

	return x >= minX && x <= maxX && y >= minY && y <= maxY;
}
let t = 0;
let obs: { x: number; y: number; dir?: number }[] = [];
const hideOhNo = () => {
	for (let i = 0; i < 30; i++) setIconPos(`ohno${i}`, -100, -100);
};
let phase = 0;
setInterval(() => {
	t += 100;
	if (t < 10000) {
		if (phase !== 1) {
			hideOhNo();
			obs=[];
			setBackground("grad1");
		}
		phase = 1;
		if (t % 1000 && obs.length < 30) obs.push({ x: Math.random() * sWidth, y: 0 });
		for (const [i, ob] of obs.entries()) {
			ob.y += 100;
			setIconPos(`ohno${i}`, ob.x, ob.y);
			if (ob.y > sHeight) obs = obs.filter(x => x !== ob);
		}
	} else if (t < 20000) {
		if (phase !== 2) {
			hideOhNo();
			setBackground("grad2");
		}
		phase = 2;
		if (obs.length !== 16) obs = [...Array(16)].map(x => ({ x: 0, y: 0 }));
		for (const [i, ob] of obs.entries()) {
			ob.y = (sHeight / 16) * i;
			if (i < 8) {
				ob.x = sWidth * Math.sin(t / 650) ** 2;
			} else ob.x = sWidth - sWidth * Math.sin(t / 650) ** 2;
			setIconPos(`ohno${i}`, ob.x, ob.y);
			if (ob.y > sHeight) obs = obs.filter(x => x !== ob);
		}
	} else if (t < 30000) {
		if (phase !== 3) {
			hideOhNo();
			obs = [];
			setBackground("grad3");
		}
		phase = 3;
		if (t % 1000 && obs.length < 30)
			obs.push({ x: Math.random() * sWidth, y: Math.random() * sHeight, dir: Math.random() * 2 * Math.PI });
		for (const [i, ob] of obs.entries()) {
			ob.x += 50 * Math.cos(ob.dir!);
			ob.y += 50 * Math.sin(ob.dir!);
			setIconPos(`ohno${i}`, ob.x, ob.y);
			if (ob.y > sHeight || ob.y < 0 || ob.x > sWidth || ob.x < 0) obs = obs.filter(x => x !== ob);
		}
	} else t = 0;
}, 150);
let damageTime = 0;
setInterval(() => {
	if (obs.some(x => isPointInAABB({ x: px, y: py }, { minX: x.x, maxX: x.x + 100, minY: x.y, maxY: x.y + 100 }))) {
		if (damageTime > Date.now()) return;
		damageTime = Date.now() + 1000;
		health -= 20;
		tickHealth();
	}
}, 10);
