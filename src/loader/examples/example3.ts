"use strict";

// @ts-ignore
import { createConfigUI } from "../../config-ui/config-ui.js";
import { FlexLight, PointLight, Prototype, Vector, Camera, Scene } from "../../flexlight/flexlight.js";

const staticPath = './static/';
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
let scene: Scene = engine.scene;
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

let light1 = new PointLight(new Vector(100, 100, 100), new Vector(1, 0, 0), 20000, 15);
let light2 = new PointLight(new Vector(-100, 100, -100), new Vector(0, 1, 1), 50000, 10);
let light3 = new PointLight(new Vector(-100, 100, 100), new Vector(1, 1, 1), 50000, 5);

scene.addPointLight(light1);
scene.addPointLight(light2);
scene.addPointLight(light3);

scene.ambientLight = new Vector(0.1, 0.1, 0.1);

// Start render engine.
engine.renderer.render();
// engine.renderer.fpsLimit = 30;

// const search = new URLSearchParams(location.search);
let urlParams = new URL(String(document.location)).searchParams;



// console.log(search.getAll());


const loadObj = async (model: string) => {	
	console.log('loading ' + model);
	const objPath = staticPath + 'objects/' + model + '.obj';
	// const mtlPath = staticPath + 'objects/' + model + '.mtl';
	const prototype = await Prototype.fromObjStatic(objPath);
	console.log("Loaded prototype", prototype);
	return prototype;
}

// let model = urlParams.get('model') ?? 'sphere';
// let prototype = await loadObj(model);
let cube = await loadObj('cube');
let dragon = await loadObj('dragon_lp');
let fullScene = await loadObj('sinan');
let sphere = await loadObj('sphere');
let bike = await loadObj('bike');

const fullScene1 = scene.instance(fullScene);
// const cube1 = scene.instance(cube);
const cube2 = scene.instance(cube);
/*
const monkey1 = scene.instance(monkey);
*/
const sphere_metallic = scene.instance(sphere);
const sphere_diffuse = scene.instance(sphere);
const sphere_rough_metal = scene.instance(sphere);
const sphere_rough_diffuse = scene.instance(sphere);

const dragon1 = scene.instance(dragon);
/*
*/
// const dragon2 = new Instance(dragon);

const bike1 = scene.instance(bike);
// const sphere1 = scene.instance(sphere);
// const monkey1 = scene.instance(monkey);
/*
cube1.transform.position = new Vector(0, -102, 0);


cube1.transform.scaleFactor = 100;
cube1.material.roughness = 1.0;
cube1.material.metallic = 0.0;
*/

fullScene1.transform.position = new Vector(-5, -10, 0);
fullScene1.transform.scale(2);
fullScene1.material.roughness = 1.0;
fullScene1.material.metallic = 0.0;



cube2.transform.position = new Vector(0, 0, 10);

bike1.transform.position = new Vector(0, -10, -30);
bike1.transform.scale(2);


//sphere1.transform.position = new Vector(10, 0, 0);
sphere_metallic.transform.position = new Vector(10, 0, 0);
sphere_metallic.transform.scale(2);
sphere_diffuse.transform.position = new Vector(15, 0, 0);
sphere_diffuse.transform.scale(2);
sphere_rough_metal.transform.position = new Vector(20, 0, 0);
sphere_rough_metal.transform.scale(2);
sphere_rough_diffuse.transform.position = new Vector(25, 0, 0);
sphere_rough_diffuse.transform.scale(2);

sphere_metallic.material.roughness = 0.05;
sphere_metallic.material.metallic = 1.0;

sphere_diffuse.material.roughness = 0.5;
sphere_diffuse.material.metallic = 1.0;

sphere_rough_metal.material.roughness = 0.7;
sphere_rough_metal.material.metallic = 0.5;

sphere_rough_diffuse.material.roughness = 1.0;
sphere_rough_diffuse.material.metallic = 0.0;


dragon1.transform.position = new Vector(-30, -9, -20);
dragon1.transform.scale(0.5);

// instance2.transform.position = new Vector(-30, 0, 0);

// sphere1.transform.position = new Vector(0, 10, 0);



// init iterator variable for simple animations
let iterator = 0;

setInterval(() => {
	// increase iterator
	iterator += 0.002;
	// precalculate sin and cos
	dragon1.transform.rotateAxis(new Vector(0, 1, 0), iterator);
	// transform3.rotateAxis(new Vector(0, 1, 0), iterator);
}, 100/6);


// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps)) + "\n" + String(scene.triangleCount);
}, 1000);
