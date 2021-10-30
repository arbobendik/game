A javascript library written with webgl to real time path trace scenes in a canvas DOM-object generated by the library.
Scenes are configurable from the ground up. There are constructors available for cuboids, planes and triangles.
At first you can create a ray tracing object via the api from the target canvas DOM-object.

```javascript
var rt = RayTracer(canvas);
```

Primary light sources can be added via the librarys rt.LIGHT object.The engine supports custom textures,
pbr(roughness, metallic)textures with emissives and several physical effects like the fresnel effect.
All structures are aranged in AABBs (Axis Aligned Bounding Boxes) to improve performance.
This tree like structure is completly customizable over the API by appending all objects in
their respective desired bounding tree to the rt.QUEUE object, where the 0th position of all sub arrays
describes the minimum and maximum values of their respective AABB. For example:

```javascript
rt.QUEUE = [
    // set min and max values for bounding box
    [xMin, xMax, yMin, yMax, zMin, zMax],
    // Actual sub elements of this bounding box.
    // Bounding boxes can be sub elements of other bounding boxes.
    cuboid0, plane0, cuboid1
];
```
Actual example code (working web-sites / scenes) on my github is linked under Examples/Screenshots below.
For performance reasons the path tracer works with 1 Sample per ray and 7 3x3 filter passes and one 5x5 pass.
The Filter can be switched on/off via the rt.Filter variable.
The sample count per ray can be controlled over the rt.SAMPLES varible as well.
The library (ray tracer object) offers many more options and functions that can't all be shown here.

(Safari & IE unsupported due to a lack of WebGl2 support).


Screenshots:

![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/screen2.png?raw=true)
example_0 (SCALE = 2 (1080p -> 4k), SAMPLES = 8)



![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/cornell.png?raw=true)
![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/emissive.png?raw=true)
![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/wave.png?raw=true)


It would be very helpful if you could visit this test page and report any errors here in the "Issues" tab:


Examples:


cornell box: https://arbobendik.github.io/web-ray-tracer/example_cornell.html

cornell box with emissive sides: https://arbobendik.github.io/web-ray-tracer/example_emissive.html

colorful pillar wave: https://arbobendik.github.io/web-ray-tracer/example_wave.html

example_0 (without textures) test page: https://arbobendik.github.io/web-ray-tracer/example_0.html

example_1 (with textures) test page: https://arbobendik.github.io/web-ray-tracer/example_1.html



More screenshots (deprecated versions):

![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/screen3.png?raw=true)

![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/screen1.png?raw=true)

![](https://github.com/arbobendik/web-ray-tracer/blob/master/screenshots/screen0.png?raw=true)
