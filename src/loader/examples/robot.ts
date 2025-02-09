"use strict";

// @ts-ignore
import { createConfigUI } from "../../config-ui/config-ui.js";
import { FlexLight, PointLight, Prototype, Vector, Camera, Scene, AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture, Texture } from "../../flexlight/flexlight.js";

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

// for (let i = 0; i < 10; i++) {
let light1 = new PointLight(new Vector(110, 100, 110), new Vector(0, 0, 1), 5000, 50);
let light2 = new PointLight(new Vector(-110, 100, -110), new Vector(0, 1, 0), 5000, 50);
let light3 = new PointLight(new Vector(-110, 100, 110), new Vector(1, 1, 1), 250000, 10);


scene.addPointLight(light1);
scene.addPointLight(light2);
scene.addPointLight(light3);
// }


const loadTexture = async (textureUrl: string, textureType: "normal" | "albedo" |  "emissive" | "roughness" | "metallic"): Promise<Texture> => {
	let promise = new Promise<HTMLImageElement>((resolve) => {
		let img = new Image();
		img.onload = () => resolve(img);
		img.src = textureUrl;
	});

	let img = await promise;
	switch (textureType) {
		case "normal":
			return new NormalTexture(img);
		case "albedo":
			return new AlbedoTexture(img);
		case "emissive":
			return new EmissiveTexture(img);
		case "roughness":
			return new RoughnessTexture(img);
		case "metallic":
			return new MetallicTexture(img);
	}
}

scene.ambientLight = new Vector(0.01, 0.01, 0.01);

// Start render engine.
engine.renderer.render();
// engine.renderer.fpsLimit = 600;

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
let plane = await loadObj('plane');
let robot = await loadObj('robot');
// let fullScene = await loadObj('sinan');
let sphere = await loadObj('sphere');
// let bike = await loadObj('bike');

// const fullScene1 = scene.instance(fullScene);
// const cube2 = scene.instance(cube);
/*
const monkey1 = scene.instance(monkey);
*/

const sphere_metallic = scene.instance(sphere);
const sphere_diffuse = scene.instance(sphere);
const sphere_rough_metal = scene.instance(sphere);
const sphere_rough_diffuse = scene.instance(sphere);

/*
*/
// const dragon2 = new Instance(dragon);

// const bike1 = scene.instance(bike);
// const sphere1 = scene.instance(sphere);
// const monkey1 = scene.instance(monkey);

let groundPlane = scene.instance(plane);
// scene.Plane([-10,-1,-10],[10,-1,-10],[10,-1,10],[-10,-1,10],[0,1,0]);
groundPlane.transform.position = new Vector(0, -2, 0);
groundPlane.transform.scale(20);
groundPlane.albedo = await loadTexture(staticPath + "textures/stonework/albedo.png", "albedo");
groundPlane.normal = await loadTexture(staticPath + "textures/stonework/normal.png", "normal");
groundPlane.roughness = await loadTexture(staticPath + "textures/stonework/roughness.png", "roughness");
groundPlane.material.metallic = 0;

/*
fullScene1.transform.position = new Vector(-5, -10, 0);
fullScene1.transform.scaleFactor = 2;
fullScene1.material.roughness = 1.0;
fullScene1.material.metallic = 0.0;



cube2.transform.position = new Vector(0, 0, 10);

bike1.transform.position = new Vector(0, -10, -30);
bike1.transform.scaleFactor = 2;
*/

//sphere1.transform.position = new Vector(10, 0, 0);
sphere_metallic.transform.position = new Vector(10, 0, 0);
sphere_diffuse.transform.position = new Vector(13, 0, 0);
sphere_rough_metal.transform.position = new Vector(16, 0, 0);
sphere_rough_diffuse.transform.position = new Vector(19, 0, 0);

sphere_metallic.material.roughness = 0.1;
sphere_metallic.material.metallic = 1.0;

sphere_diffuse.material.roughness = 0.5;
sphere_diffuse.material.metallic = 1.0;

sphere_rough_metal.material.roughness = 0.7;
sphere_rough_metal.material.metallic = 0.5;

sphere_rough_diffuse.material.roughness = 1.0;
sphere_rough_diffuse.material.metallic = 0.0;


/*
for (let i = 0; i < 5; i++) {
	for (let j = 0; j < 5; j++) {
		let dragon_instance = scene.instance(dragon);
		dragon_instance.transform.position = new Vector(20 * j, 0, -20 * i);
		
		dragon_instance.material.roughness = Math.max(0.1, j / 5);
		dragon_instance.material.metallic = 1.0 - j / 5;

		// init iterator variable for simple animations
		let iterator = 0;

		setInterval(() => {
			// increase iterator
			iterator += 0.001 + 0.0005 * j + 0.0007 * i;
			// precalculate sin and cos
			dragon_instance.transform.rotateAxis(new Vector(0, 1, 0), iterator);
			// transform3.rotateAxis(new Vector(0, 1, 0), iterator);
		}, 100/6);
	}
}
*/


let robot_instance = scene.instance(robot);
robot_instance.transform.position = new Vector(0, -2, -10);

robot_instance.material.color = new Vector(1.0, 0.784, 0.392);
robot_instance.transform.scale(0.005);
robot_instance.normal = await loadTexture(staticPath + "textures/worn-metal/normal.png", "normal");
robot_instance.material.roughness = 0.1;
robot_instance.material.metallic = 1.0;


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
