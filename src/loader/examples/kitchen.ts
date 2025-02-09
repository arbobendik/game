"use strict";

// @ts-ignore
import { createConfigUI } from "../../config-ui/config-ui.js";
import { FlexLight, PointLight, Prototype, Vector, Camera, Scene, Instance } from "../../flexlight/flexlight.js";

export const staticPath = './static/';
// Create new canvas
const canvas = document.createElement("canvas");
// Append it to body
document.body.appendChild(canvas);
// Create new engine object for canvas



const engine = new FlexLight (canvas);
engine.io = 'web';


const controlPanel = document.getElementById("controlPanel");
if (!controlPanel) throw new Error("Control panel not found");

const configUI = createConfigUI(engine);
controlPanel.appendChild(configUI);



let camera: Camera = engine.camera;
export let scene: Scene = engine.scene;
/*
[
	staticPath + "textures/grass.jpg",     // 0
].forEach(item => {
	let img = new Image();
	img.src = item;
	scene.textures.push(img);
});
*/

// Set camera perspective and position.
[camera.position.x, camera.position.y, camera.position.z] = [-10, 10, 10];
[camera.direction.x, camera.direction.y] = [-2.38, 0.4];

// for (let i = 0; i < 10; i++) {
let light = new PointLight(new Vector(-110, 100, 110), new Vector(1, 1, 1), 100000, 0);
let light2 = new PointLight(new Vector(110, 100, 110), new Vector(1, 1, 1), 100000, 0);
let light3 = new PointLight(new Vector(110, 100, -110), new Vector(1, 1, 1), 100000, 0);
scene.addPointLight(light);
scene.addPointLight(light2);
scene.addPointLight(light3);
// }

scene.ambientLight = new Vector(0.01, 0.01, 0.01);

// Start render engine.
engine.renderer.render();
// engine.renderer.fpsLimit = 600;

// const search = new URLSearchParams(location.search);
let urlParams = new URL(String(document.location)).searchParams;



// console.log(search.getAll());


const loadObj = async function* (model: string): AsyncGenerator<Prototype> {	
	console.log('loading ' + model);
	const objPath = staticPath + 'objects/' + model + '.obj';
	// const mtlPath = staticPath + 'objects/' + model + '.mtl';
	let prototypeGenerator = Prototype.fromObj(objPath);
	for await (let prototype of prototypeGenerator) yield prototype;
}

let kitchen = loadObj('kitchen');

let kitchenInstances: Array<Instance> = [];
for await (let prototype of kitchen) {
	const kitchen_instance = scene.instance(prototype);
	kitchen_instance.transform.scale(0.01);
	kitchen_instance.transform.position = new Vector(20, 0, 20);
	kitchen_instance.material.roughness = 1.0;
	kitchen_instance.material.metallic = 0.0;
	kitchenInstances.push(kitchen_instance);
}

console.log("Kitchen instances:", kitchenInstances);

// instance2.transform.position = new Vector(-30, 0, 0);

// sphere1.transform.position = new Vector(0, 10, 0);



// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// setTimeout(() => engine.renderer.freeze = true, 1000);

/*
// init iterator variable for simple animations
let iterator = 0;

setInterval(() => {
	// increase iterator
	iterator += 0.002;
	// precalculate sin and cos
	dragon1.transform.rotateAxis(new Vector(0, 1, 0), iterator);
	// transform3.rotateAxis(new Vector(0, 1, 0), iterator);
}, 100/6);
*/


// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps)) + "\n" + String(scene.triangleCount);
}, 1000);
