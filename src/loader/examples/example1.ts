"use strict";

import { Camera, FlexLight, Prototype, Scene, Vector, Texture, AlbedoTexture, PointLight, vector_scale, RoughnessTexture, MetallicTexture, EmissiveTexture, NormalTexture } from '../../flexlight/flexlight.js';
import { createConfigUI } from '../../config-ui/config-ui.js';
// import { vector_scale } from 'flexlight/common/lib/math';

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
export let scene: Scene = engine.scene;


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

const loadObj = async (model: string) => {	
	console.log('loading ' + model);
	const objPath = staticPath + 'objects/' + model + '.obj';
	// const mtlPath = staticPath + 'objects/' + model + '.mtl';
	const prototype = await Prototype.fromObjStatic(objPath);
	console.log("Loaded prototype", prototype);
	return prototype;
}

export const planePrototype = await loadObj('plane');
const cubePrototype = await loadObj('cube');

const cuboid = (xmin: number, xmax: number, ymin: number, ymax: number, zmin: number, zmax: number) => {
	let cuboid = scene.instance(cubePrototype);
	let diff_half: Vector<3> = vector_scale(new Vector(xmax - xmin, ymax - ymin, zmax - zmin), 0.5 - 0.001);
	cuboid.transform.position = new Vector(xmin + diff_half.x, ymin + diff_half.y, zmin + diff_half.z);
	cuboid.transform.scale(diff_half);
	return cuboid;
}

// Set camera perspective and position
camera.position = new Vector(8, 7, -11);
camera.direction = new Vector(0.440, 0.55);


let pointLightCenter = new PointLight(new Vector(0.5, 1.5, 0.5), new Vector(1, 1, 1), 1000, 0.2);
let pointLightTop = new PointLight(new Vector(0, 15, 2), new Vector(1, 1, 1), 300, 0.1);
scene.addPointLight(pointLightTop);
scene.addPointLight(pointLightCenter);
scene.ambientLight = new Vector(0.1, 0.1, 0.1);
/*
scene.primaryLightSources = [[0.5, 1.5, 0.5], [0, 15, 2]];
// Make light dimmer (default = 200)
scene.primaryLightSources[0].intensity = 400;
scene.primaryLightSources[0].variation = 0.2;
scene.primaryLightSources[1].intensity = 300;
// Set ambient illumination
scene.ambientLight = [0.1, 0.1, 0.1];



// Set texture Sizes
scene.standardTextureSizes = [16, 16];
*/

// Create large ground plane
let groundPlane = scene.instance(planePrototype);
// scene.Plane([-10,-1,-10],[10,-1,-10],[10,-1,10],[-10,-1,10],[0,1,0]);
groundPlane.transform.position = new Vector(0, -1, 0);
groundPlane.transform.scale(10);
// groundPlane.roughness = roughnessTextures[1]!;
groundPlane.albedo = await loadTexture(staticPath + "textures/stonework/albedo.png", "albedo");
groundPlane.normal = await loadTexture(staticPath + "textures/stonework/normal.png", "normal");
groundPlane.roughness = await loadTexture(staticPath + "textures/stonework/roughness.png", "roughness");
groundPlane.material.metallic = 0;
// groundPlane.emissive = await loadTexture(textureUrls.get("lamp")!, "emissive");
// groundPlane.metallic = await loadTexture(textureUrls.get("redstone")!, "metallic");


// groundPlane.textureNums = [-1, 1, -1];
// scene.queue.push(groundPlane);
/*
let cuboids: Array<Instance> = [
	scene.instance(cubePrototype),
	scene.instance(cubePrototype),
	scene.instance(cubePrototype),
	scene.instance(cubePrototype)
];

cuboids[0]!.transform.position = new Vector(3.75, 0.5, 2);
cuboids[1]!.transform.position = new Vector(0, 0.5, -1.5);
cuboids[2]!.transform.position = new Vector(1, 0.5, -0.5);
cuboids[3]!.transform.position = new Vector(-1, 0.5, -0.5);

cuboids[0]!.transform.scale(new Vector(3, 1.5, 0.5));
cuboids[1]!.transform.scale(new Vector(1.5, 1.5, 0.5));
cuboids[2]!.transform.scale(new Vector(0.5, 1.5, 0.5));
cuboids[3]!.transform.scale(new Vector(0.5, 1.5, 0.5));
*/

// Generate a few translucent cuboids on surface
let cuboids = [
	cuboid(-1.5, 4.5, -1, 2, 1.5, 2.5),
	cuboid(-1.5, 1.5, -1, 2, -2, -1),
	cuboid(0.5, 1.5, -1, 2, -1, 0),
	cuboid(-1.5, -0.5, -1, 2, - 1, 0)
];


let cuboidColors = [
	[230, 170, 0],
	[0, 150, 150],
	[150, 0, 100],
	[0, 0, 200]
]

// Color all cuboid in center
cuboids.forEach((cuboid, i) => {
	cuboid.material.roughness = 0;
	cuboid.material.metallic = 0.5;
	cuboid.material.transmission = 1;
	cuboid.material.ior = 1.3;
	cuboid.material.color = new Vector(cuboidColors[i]![0]! / 255, cuboidColors[i]![1]! / 255, cuboidColors[i]![2]! / 255);
	// Append to render-queue
	// scene.queue.push(cuboid);
});


let grassCubes = [
	cuboid(5.5, 6.5, 1.5, 2.5, 5.8, 6.8),
	cuboid(-3, -2, -1, 0, -5.2, -4.2)
];


/*
grassCubes.forEach(cube => {
	cube.textureNums = [0, -1, -1];
	cube.top.textureNums = [1, -1, -1];
	cube.bottom.textureNums = [2, -1, -1];
	// scene.queue.push(cube);
});
*/

// Create diffuse white "wall" cuboid
let wall = cuboid(2.5, 7.5, -1, 1.5, 5, 7);
// Spawn red cube on top of "wall"
let redCube = cuboid(4, 5, 1.5, 2.5, 5.2, 6.2);
// redCube.textureNums = [3, 0, -1];
// scene.queue.push(redCube);
// Spawn lantern on the floor
let lantern = cuboid(-2.5, -1.5, -1, 0, -3.8, -2.8);
// lantern.textureNums = [4, -1, -1];
lantern.material.metallic = 1;
lantern.material.emissive = new Vector(2, 2, 2);


engine.renderer.render();
// scene.queue.push(lantern);
/*
let recreateBVH = (subTree) => {
	let list = [];
	let disasembleGraph = (item) => {
		if (item.static) {
			list.push(item);
		} else if (Array.isArray(item) || item.indexable) {
			if (item.length === 0) return;
			for (let i = 0; i < item.length; i++) disasembleGraph(item[i]);
		} else {
			list.push(item);
		}
	}

	disasembleGraph(subTree);
	let newSubTree = scene.generateBVH(list);
	
	for (let i = 0; i < Math.max(subTree.length, newSubTree.length); i++) {
		if (i < newSubTree.length) {
			subTree[i] = newSubTree[i];
		} else {
			// Dereference old children of subtree
			subTree[i] = undefined;
		}
	}
}
recreateBVH(scene.queue);

scene.generateBVH();
// start render engine
engine.renderer.render();
// engine.renderer.fpsLimit = 30;
// add FPS counter to top-right corner
var fpsCounter = document.createElement("div");
// append it to body
document.body.appendChild(fpsCounter);
// update frame-counter periodically
setInterval(function(){
	fpsCounter.textContent = engine.renderer.fps;
}, 1000);
*/

setTimeout(() => {
	console.log(Texture.textureDataBufferManager.bufferView);
}, 1000);

// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps)) + "\n" + String(scene.triangleCount);
}, 1000);
