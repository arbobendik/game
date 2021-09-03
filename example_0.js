"use strict";
// Wait until DOM is loaded.
document.addEventListener("DOMContentLoaded", function(){
	// Create new canvas.
	var canvas = document.createElement("canvas");
	// Append it to body.
	document.body.appendChild(canvas);
	// Create new RayTracer (rt) for canvas.
	var rt = RayTracer(canvas);
	// Generate some planes in bounding box structure.
	let test_planes = [[-10, 10, -1, -0.9, -10, 10], [],[],[],[],[]];
	// Create 25 plane elements.
	for (let i = 0; i < 25; i++)
	{
		let x = -10 + 4*(i%5);
		let z = -10 + 4*Math.floor(i / 5);
		let this_plane = rt.PLANE([x,-1,z],[x+4,-1,z],[x+4,-1,z+4],[x,-1,z+4],[0,1,0]);
	  // Push bounding volume.
	  if (i < 5) test_planes[i%5 + 1].push([-10 + 4*(i%5), -10 + 4*(i%5 + 1), -1, -0.9, -10, 10]);
	  // Push vertices.
	  test_planes[i%5 + 1].push(this_plane);
	}
	// Generate a few cuboids on the planes with bounding box.
	let r = [];
	r[0] = rt.CUBOID(-1.5, -1, 1.5, 6, 3, 1);
	r[1] = rt.CUBOID(-1.5, -1, -2, 3, 3, 1);
	r[2] = rt.CUBOID(0.5, -1, -1, 1, 3, 1);
	r[3] = rt.CUBOID(-1.5, -1, - 1, 1, 3, 1);
	// Spawn dice.
	let dice = rt.CUBOID(5.5, 1.5, 5.5, 1, 1, 1);
	// Package dice and cuboids together in a shared bounding volume.
	let objects = [
	  [-1.5, 6.5, -1, 2.5, -2, 6.5],
	  [[-1.5, 4.5, -1, 2, -2, 2.5], r[0], r[1], r[2], r[3]],
	  dice
	];
	// Append both objects to render queue.
	rt.QUEUE.push(test_planes, objects);
	// Start render engine.
	rt.START();
});
