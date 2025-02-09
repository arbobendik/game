"use strict";

// @ts-ignore
import { createConfigUI } from "../../config-ui/config-ui.js";
// import { vector_difference, vector_length } from "../../flexlight/common/lib/math.js";
import { FlexLight, PointLight, Prototype, Vector, Camera, Scene, vector_difference, vector_length } from "../../flexlight/flexlight.js";

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

const loadObj = async (model: string) => {	
	console.log('loading ' + model);
	const objPath = staticPath + 'objects/' + model + '.obj';
	// const mtlPath = staticPath + 'objects/' + model + '.mtl';
	const prototype = await Prototype.fromObjStatic(objPath);
	console.log("Loaded prototype", prototype);
	return prototype;
}

// Set camera perspective and position.
[camera.position.x, camera.position.y, camera.position.z] = [-10, 14, -10];
[camera.direction.x, camera.direction.y] = [- .9, .45];

// for (let i = 0; i < 10; i++) {
let light1 = new PointLight(new Vector(50 ,70, 50), new Vector(1, 1, 1), 50000, 10);
scene.addPointLight(light1);

scene.ambientLight = new Vector(0.1, 0.1, 0.1);

const plane = await loadObj('plane');
const dragon = await loadObj('dragon_lp');
const monke = await loadObj('monke_smooth');
const sphere = await loadObj('sphere');

let planeInstance = scene.instance(plane);
planeInstance.transform.move(0, -1, 0);
planeInstance.transform.scale(500);
planeInstance.material.roughness = 1.0;
planeInstance.material.metallic = 0.8;

let dragonInstance = scene.instance(dragon);
dragonInstance.transform.move(15, 0, 15);
dragonInstance.transform.scale(0.5);
dragonInstance.material.color = new Vector(1.0, 0.392, 0.392);
dragonInstance.material.roughness = 0;
dragonInstance.material.metallic = 1;
dragonInstance.material.transmission = 1;
dragonInstance.material.ior = 1.5;

let monkeInstance = scene.instance(monke);
monkeInstance.transform.move(5, 1, 12);
monkeInstance.transform.scale(2);
monkeInstance.material.color = new Vector(1.0, 0.784, 0.392);
monkeInstance.material.roughness = 0.1;
monkeInstance.material.metallic = 1;

let sphereInstance = scene.instance(sphere);
sphereInstance.transform.move(15, 3, 0);
sphereInstance.transform.scale(4);
sphereInstance.material.roughness = 0;
sphereInstance.material.metallic = 1;
sphereInstance.material.transmission = 1;
sphereInstance.material.ior = 1.5;
// Start render engine.
engine.renderer.render();

let rotationAngle = 0;
setInterval(() => {
	// dragonTransform.rotate([0, 0, 1], 0.0025);
	///let pos = dragonTransform.position;
	rotationAngle += 0.001;
	// dragonTransform.move(Math.sin(rotationAngle) * 20, 0, Math.cos(rotationAngle) * 20);
	// monkeTransform.move(Math.sin(rotationAngle) * 20, 1, Math.cos(rotationAngle) * 20);
	// dragonTransform.rotateSpherical(rotationAngle, 0);
	
	let diff = vector_difference(camera.position, monkeInstance.transform.position);
	let r = vector_length(diff);
	let theta = Math.sign(diff.z) * Math.acos(diff.x / Math.sqrt(diff.x * diff.x + diff.z * diff.z)) - Math.PI * 0.5;
	let psi = Math.acos(diff.y / r) - Math.PI * 0.5;
	monkeInstance.transform.rotateSpherical(theta, psi);
	/*
	diff = Math.diff([camera.x, camera.y, camera.z], dragonTransform.position);
	r = Math.length(diff);
	theta = Math.sign(diff[2]) * Math.acos(diff[0] / Math.sqrt(diff[0] * diff[0] + diff[2] * diff[2])) - Math.PI;
	psi = Math.acos(diff[1] / r);
	dragonTransform.rotateSpherical(theta, 0);
	*/

}, 1000 / 330);

// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps)) + "\n" + String(scene.triangleCount);
}, 1000);

