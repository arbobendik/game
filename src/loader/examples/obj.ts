"use strict";

import { createConfigUI } from "../../config-ui/config-ui.js";
import { FlexLight, PointLight, Prototype, Vector, Camera, Scene, AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture, Texture, EnvironmentMap } from "../../flexlight/flexlight.js";

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
// let light1 = new PointLight(new Vector(110, 110, 110), new Vector(1, 0.5, 0.5), 30000, 10);
// let light2 = new PointLight(new Vector(-110, 110, -110), new Vector(0.5, 0.5, 1), 50000, 10);
let light3 = new PointLight(new Vector(-110, 100, 100), new Vector(1, 1, 1), 100000, 10);


// scene.addPointLight(light1);
// scene.addPointLight(light2);
scene.addPointLight(light3);
// }

scene.ambientLight = new Vector(0.1, 0.1, 0.1);

let environmentMapImages: Array<HTMLImageElement> = [];
let environmentMapPromises = Array<Promise<HTMLImageElement>>();

let environmentMapUrls = [
	"textures/cube-map/px.png",
	"textures/cube-map/nx.png",
	"textures/cube-map/py.png",
	"textures/cube-map/ny.png",
	"textures/cube-map/pz.png",
	"textures/cube-map/nz.png",
];

for (let i = 0; i < 6; i++) {
	environmentMapPromises.push(new Promise<HTMLImageElement>((resolve) => {
		let img = new Image();
		img.onload = () => {
			resolve(img);
		};
		img.src = staticPath + environmentMapUrls[i];
	}));
}


for (let i = 0; i < 6; i++) {
	let img = await environmentMapPromises[i];
	if (img) {
		environmentMapImages[i] = img;
		console.log("Loaded environment map ", img);
	} else {
		console.error("Failed to load environment map " + environmentMapUrls[i]);
	}
}

console.log("Environment map images: ", environmentMapImages);
scene.environmentMap = new EnvironmentMap(environmentMapImages);

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
// let cube = await loadObj('cube');
let plane = await loadObj('plane');
let dragon = await loadObj('dragon_lp');
// let fullScene = await loadObj('sinan');
let sphere = await loadObj('sphere');
let monkey = await loadObj('monke');

// const fullScene1 = scene.instance(fullScene);
// const cube1 = scene.instance(cube);
let groundPlane = scene.instance(plane);
// const cube2 = scene.instance(cube);

const monkey1 = scene.instance(monkey);


const sphere_rusted = scene.instance(sphere);
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

/*
cube1.transform.position = new Vector(0, -102, 0);
cube1.transform.scale(100);
cube1.material.roughness = 1;
cube1.material.metallic = 0;
*/

groundPlane.transform.position = new Vector(0, -2, 0);
groundPlane.transform.scale(30);

groundPlane.material.roughness = 0.6;
groundPlane.material.metallic = 0;
groundPlane.albedo = await loadTexture(staticPath + "textures/stonework/albedo.png", "albedo");
groundPlane.normal = await loadTexture(staticPath + "textures/stonework/normal.png", "normal");
groundPlane.roughness = await loadTexture(staticPath + "textures/stonework/roughness.png", "roughness");
/*
cube2.transform.position = new Vector(100, 0, -100);
cube2.transform.rotateAxis(new Vector(0, 1, 0), Math.PI / 4);
cube2.transform.scale(100);
cube2.material.roughness = 0;
cube2.material.metallic = 0.5;
*/

/*


/*
fullScene1.transform.position = new Vector(-5, -10, 0);
fullScene1.transform.scaleFactor = 2;
fullScene1.material.roughness = 1.0;
fullScene1.material.metallic = 0.0;




cube2.transform.position = new Vector(0, 0, 10);
 * POINT_LIGHT_SIZE
bike1.transform.position = new Vector(0, -10, -30);
bike1.transform.scaleFactor = 2;
*/

monkey1.transform.position = new Vector(5, 1, 0);
// monkey1.transform.scale(new Vector(3, 1.8, 0.5));
monkey1.material.roughness = 0;
monkey1.material.metallic = 1;
monkey1.material.transmission = 1;
monkey1.material.ior = 1.5;

//sphere1.transform.position = new Vector(10, 0, 0);
sphere_metallic.transform.position = new Vector(10, 0, 0);
sphere_diffuse.transform.position = new Vector(13, 0, 0);
sphere_rough_metal.transform.position = new Vector(16, 0, 0);
sphere_rough_diffuse.transform.position = new Vector(19, 0, 0);

sphere_rusted.transform.position = new Vector(10, 0, -3);

sphere_metallic.material.roughness = 0.1;
sphere_metallic.material.metallic = 1.0;


sphere_diffuse.material.roughness = 0.5;
sphere_diffuse.material.metallic = 1.0;

sphere_rough_metal.material.roughness = 0.7;
sphere_rough_metal.material.metallic = 0.5;

// sphere_rough_diffuse.material.roughness = 1.0;
sphere_rough_diffuse.material.metallic = 0.0;
sphere_rough_diffuse.material.roughness = 1.0;
sphere_rough_diffuse.material.emissive = new Vector(10, 2, 2);
/*
sphere_rough_diffuse.albedo = await loadTexture(staticPath + "textures/stonework/albedo.png", "albedo");
sphere_rough_diffuse.roughness = await loadTexture(staticPath + "textures/stonework/roughness.png", "roughness");
sphere_rough_diffuse.normal = await loadTexture(staticPath + "textures/stonework/normal.png", "normal");
*/

sphere_rusted.albedo = await loadTexture(staticPath + "textures/rusted/albedo.png", "albedo");
sphere_rusted.roughness = await loadTexture(staticPath + "textures/rusted/roughness.png", "roughness");
sphere_rusted.metallic = await loadTexture(staticPath + "textures/rusted/metallic.png", "metallic");
sphere_rusted.normal = await loadTexture(staticPath + "textures/rusted/normal.png", "normal");


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


let dragon_instance = scene.instance(dragon);
dragon_instance.transform.position = new Vector(0, 0, -20);
dragon_instance.transform.scale(1);
dragon_instance.material.roughness = 0.5;
dragon_instance.material.metallic = 1.0;


// init iterator variable for simple animations
let iterator = 0;

setInterval(() => {
	// increase iterator
	iterator += 0.005;
	// precalculate sin and cos
	dragon_instance.transform.rotateAxis(new Vector(0, 1, 0), iterator);
	// dragon_instance.transform.position = new Vector(Math.sin(iterator) * 10, Math.cos(iterator) * 10, -20);
	// transform3.rotateAxis(new Vector(0, 1, 0), iterator);
}, 100/6);

// instance2.transform.position = new Vector(-30, 0, 0);

// sphere1.transform.position = new Vector(0, 10, 0);



// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps)) + "\n" + String(scene.triangleCount);
}, 1000);
