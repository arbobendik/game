"use strict";
// Declare RayTracer global.
var rt;
// Wait until DOM is loaded.
document.addEventListener("DOMContentLoaded", async function(){
	// Create new canvas.
	var canvas = document.createElement("canvas");
	// Append it to body.
	document.body.appendChild(canvas);
	// Create new RayTracer (rt) for canvas.
	rt = new rayTracer(canvas);

	// Make plane defuser.
	let normal_tex = await rt.textureFromRME([0.5, 0, 0], 1, 1);
	rt.pbrTextures.push(normal_tex);

	// Set camera perspective and position.
	[rt.x, rt.y, rt.z] = [-12, 5, -18];
	[rt.fx, rt.fy] = [0.440, 0.235];

	// Set two light sources.
	rt.primaryLightSources = [[0, 10, 0], [5, 5, 5]];
	rt.primaryLightSources[0].intensity = 100;
	rt.primaryLightSources[1].intensity = 100;

	// Generate plane.
	let this_plane = rt.plane([-100,-1,-100],[100,-1,-100],[100,-1,100],[-100,-1,100],[0,1,0]);
	this_plane.textureNums = new Array(6).fill([-1,0,-1]).flat();
	// Generate a few cuboids on the planes with bounding box.
	let r = [];
	r[0] = rt.cuboid(-1.5, 4.5, -1, 2, 1.5, 2.5);
	r[1] = rt.cuboid(-1.5, 1.5, -1, 2, -2, -1);
	r[2] = rt.cuboid(0.5, 1.5, -1, 2, -1, 0);
	r[3] = rt.cuboid(-1.5, -0.5, -1, 2, -1, 0);
	// Color all cuboids in center.
	for (let i = 0; i < 4; i++){
		let color = new Array(6).fill([Math.random(), Math.random(), Math.random()]).flat();
		for (let j = 1; j < 7; j++) r[i][j].colors = color;
	}

	// Spawn cube.
	let cube = rt.cuboid(5.5, 6.5, 1.5, 2.5, 5.5, 6.5);
	// Package cube and cuboids together in a shared bounding volume.
	let objects = [
	  [-1.5, 6.5, -1, 2.5, -2, 6.5],
	  [[-1.5, 4.5, -1, 2, -2, 2.5], r[0], r[1], r[2], r[3]],
	  cube
	];
	// Push both objects to render queue.
	rt.queue.push(this_plane, objects);
	// Start render engine.
	rt.render();

	// Add FPS counter to top-right corner.
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
  // Update Counter periodically.
	setInterval(function(){
		fpsCounter.textContent = rt.FPS;
		// Update textures every second.
		rt.UPDATE_TEXTURE();
		rt.UPDATE_PBR_TEXTURE();
    rt.UPDATE_TRANSLUCENCY_TEXTURE();
	},1000);

	// Init iterator variable for simple animations.
	let iterator = 0;

	setInterval(async function(){
		// Increase iterator.
		iterator += 0.01;
		// Precalculate sin and cos.
		let [sin, cos] = [Math.sin(iterator), Math.cos(iterator)];
		// Animate light sources.
		rt.primaryLightSources =  [[20*sin, 8, 20*cos], [2*cos, 80, 10*sin]];
		rt.primaryLightSources[1].strength = 1000;
		rt.updatePrimaryLightSources();
		// Calculate new width for this frame.
		let newX = 6.5 + 4 * sin;
		// Create new resized R0 object.
		let newR0 = rt.cuboid(-1.5 + newX, 1.5 + newX, -1, 2, 1.5, 2.5);
		// Color new cuboid.
		for (let j = 1; j < 7; j++) newR0[j].colors = r[0][j].colors;
		// Update bounding boxes.
		rt.queue[1][0] = [-1.5, 6.5 + newX, -1, 2.5, -2, 6.5];
		rt.queue[1][1][0] = [-1.5, 4.5 + newX, -1, 2, -2, 2.5];
		// Push element in QUEUE.
		rt.queue[1][1][1] = newR0;
	}, 100/6);
});
