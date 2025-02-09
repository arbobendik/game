'use strict';

import { Network } from './network.js';
import { GLLib } from './gllib.js';
import { FXAA } from './fxaa.js';
import { TAA } from './taa.js';
import { Transform } from './scene.js';
import { Arrays, Float16Array } from './arrays.js';


const PathtracingUniformLocationIdentifiers = [
  'cameraPosition', 'viewMatrix',
  'samples', 'maxReflections', 'minImportancy', 'useFilter', 'isTemporal',
  'ambient', 'randomSeed', 'textureWidth',
  'geometryTex', 'sceneTex', 'pbrTex', 'translucencyTex', 'tex', 'lightTex'
];

const PathtracingUniformFunctionTypes = [
  'uniform3f', 'uniformMatrix3fv',
  'uniform1i', 'uniform1i', 'uniform1f', 'uniform1i', 'uniform1i',
  'uniform3f', 'uniform1f', 'uniform1i',
  'uniform1i', 'uniform1i', 'uniform1i', 'uniform1i', 'uniform1i', 'uniform1i'
];

export class PathTracerWGL2 {
  type = 'pathtracer';
  // Configurable runtime properties of the pathtracer (public attributes)
  config;
  // Performance metric
  fps = 0;
  fpsLimit = Infinity;
  // Internal state of antialiasing
  #antialiasing;
  #AAObject;
  // Make gl object inaccessible from outside the class
  #gl;
  #canvas;

  #halt = true;

  #geometryTexture;
  #sceneTexture;
  // Buffer arrays
  #triangleIdBufferArray;
  #bufferLength;

  // Internal gl texture variables of texture atlases
  #textureAtlas;
  #pbrAtlas;
  #translucencyAtlas;

  #textureList = [];
  #pbrList = [];
  #translucencyList = [];

  #lightTexture;
  // Shader source will be generated later
  #tempGlsl;
  // Create new PathTracer from canvas and setup movement
  constructor (canvas, scene, camera, config) {
    this.#canvas = canvas;
    this.camera = camera;
    this.scene = scene;
    this.config = config;
    this.#gl = canvas.getContext('webgl2');

    this.config.temporalSamples = Math.floor(this.#gl.getParameter(this.#gl.MAX_TEXTURE_IMAGE_UNITS) / 4);
  }

  halt = () => {
    try {
      this.#gl.loseContext();
    } catch (e) {
      console.warn("Unable to lose previous context, reload page in case of performance issue");
    }
    this.#halt = true;
  }
  
  // Make canvas read only accessible
  get canvas () {
    return this.#canvas;
  }

  // Functions to update texture atlases to add more textures during runtime
	async #updateAtlas (list) {
		// Test if there is even a texture
		if (list.length === 0) {
			this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, 1, 1, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, new Uint8Array(4));
			return;
		}

		const [width, height] = this.scene.standardTextureSizes;
		const textureWidth = Math.floor(2048 / width);
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		canvas.width = width * textureWidth;
		canvas.height = height * list.length;
		ctx.imageSmoothingEnabled = false;
    // TextureWidth for third argument was 3 for regular textures
		list.forEach(async (texture, i) => ctx.drawImage(texture, width * (i % textureWidth), height * Math.floor(i / textureWidth), width, height));

    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, canvas);
	}

  async #updateTextureAtlas () {
    // Don't build texture atlas if there are no changes.
    if (this.scene.textures.length === this.#textureList.length && this.scene.textures.every((e, i) => e === this.#textureList[i])) return;
    this.#textureList = this.scene.textures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#textureAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
		this.#updateAtlas(this.scene.textures);
  }

  async #updatePbrAtlas () {
    // Don't build texture atlas if there are no changes.
    if (this.scene.pbrTextures.length === this.#pbrList.length && this.scene.pbrTextures.every((e, i) => e === this.#pbrList[i])) return;
    this.#pbrList = this.scene.pbrTextures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#pbrAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
		this.#updateAtlas(this.scene.pbrTextures);
  }

  async #updateTranslucencyAtlas () {
    // Don't build texture atlas if there are no changes.
    if (this.scene.translucencyTextures.length === this.#translucencyList.length && this.scene.translucencyTextures.every((e, i) => e === this.#translucencyList[i])) return;
    this.#translucencyList = this.scene.translucencyTextures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#translucencyAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
		this.#updateAtlas(this.scene.translucencyTextures);
  }

  // Functions to update vertex and light source data textures
  async updatePrimaryLightSources () {
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#lightTexture);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
		// Don't update light sources if there is none
		if (this.scene.primaryLightSources.length === 0) {
			this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGB32F, 1, 1, 0, this.#gl.RGB, this.#gl.FLOAT, new Float32Array(3));
			return;
		}

    var lightTexArray = [];
    // Iterate over light sources
		this.scene.primaryLightSources.forEach(lightSource => {
			// Set intensity to lightSource intensity or default if not specified
			const intensity = Object.is(lightSource.intensity)? this.scene.defaultLightIntensity : lightSource.intensity;
			const variation = Object.is(lightSource.variation)? this.scene.defaultLightVariation : lightSource.variation;
			// push location of lightSource and intensity to texture, value count has to be a multiple of 3 rgb format
			lightTexArray.push(lightSource[0], lightSource[1], lightSource[2], intensity, variation, 0);
		});

    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGB32F, 2, this.scene.primaryLightSources.length, 0, this.#gl.RGB, this.#gl.FLOAT, Float32Array.from(lightTexArray));
  }

  async updateScene () {
    // Generate texture arrays and buffers
    let builtScene = await this.scene.generateArraysFromGraph();
    // Set buffer parameters
    this.#bufferLength = builtScene.bufferLength;
    this.#triangleIdBufferArray = builtScene.idBuffer;
    // Upload textures
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#geometryTexture);
    // Tell webgl to use 4 bytes per value for the 32 bit floats
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 4);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA32F, 3 * 256, builtScene.geometryBufferHeight, 0, this.#gl.RGBA, this.#gl.FLOAT, builtScene.geometryBuffer);
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA16F, 3 * 256, builtScene.geometryTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.HALF_FLOAT, new Float16Array(builtScene.geometryTextureArray));
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#sceneTexture);
    GLLib.setTexParams(this.#gl);
    // Tell webgl to use 2 bytes per value for the 16 bit floats
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 4);
    // Set data texture details and tell webgl, that no mip maps are required
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA32F, 7 * 256, builtScene.sceneBufferHeight, 0, this.#gl.RGBA, this.#gl.FLOAT, builtScene.sceneBuffer);
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA16F, 7 * 256, builtScene.sceneTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.HALF_FLOAT, new Float16Array(builtScene.sceneTextureArray));
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.SRGB8, 7 * 256, builtScene.sceneTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, new Uint8Array(uiltScene.sceneTextureArray));
  }

  async render() {
    // Allow frame rendering
    this.#halt = false;
    // Internal GL objects
    let Program;
    let TempProgram, TempHdrLocation;
    // Init Buffers
    let triangleIdBuffer, vertexIdBuffer;
    // Uniform variables
    let UboBuffer, UboVariableIndices, UboVariableOffsets;
    // Framebuffer, Post Program buffers and textures
    let Framebuffer, TempFramebuffer, OriginalIdRenderTexture;
    let HdrLocation;
    // Set post program array
    let PostProgram = [];
    // Create textures for Framebuffers in PostPrograms
    let RenderTexture = new Array(5);
    let IpRenderTexture = new Array(5);
    let DepthTexture = new Array(5);
    let OriginalRenderTexture = new Array(2);
    let IdRenderTexture = new Array(2);

    let TempTexture = new Array(this.config.temporalSamples);
    let TempIpTexture = new Array(this.config.temporalSamples);
    let TempIdTexture = new Array(this.config.temporalSamples);
    let TempOriginalIdTexture = new Array(this.config.temporalSamples);
    
    let TempTex = new Array(this.config.temporalSamples);
    let TempIpTex = new Array(this.config.temporalSamples);
    let TempIdTex = new Array(this.config.temporalSamples);
    let TempOriginalIdTex = new Array(this.config.temporalSamples);

    for (let i = 0; i < this.config.temporalSamples; i++) {
      TempTexture[i] = this.#gl.createTexture();
      TempIpTexture[i] = this.#gl.createTexture();
      TempIdTexture[i] = this.#gl.createTexture();
      TempOriginalIdTexture[i] = this.#gl.createTexture();
    }

    let RenderTex = new Array(5);
    let IpRenderTex = new Array(5);
    let OriginalRenderTex = new Array(5);
    let IdRenderTex = new Array(5);
    let OriginalIdRenderTex = new Array(5);
    // Create caching textures for denoising
		for (let i = 0; i < 5; i ++) {
				RenderTexture[i] = this.#gl.createTexture();
				IpRenderTexture[i] = this.#gl.createTexture();
        if (i < 2) OriginalRenderTexture[i] = this.#gl.createTexture();
        if (i < 2) IdRenderTexture[i] = this.#gl.createTexture();
				DepthTexture[i] = this.#gl.createTexture();
    }
    // Create buffers for vertices in PostPrograms
    let PostVertexBuffer = new Array(5);
    let PostFramebuffer = new Array(5);
    // Create different Vaos for different rendering/filtering steps in pipeline
    let Vao = this.#gl.createVertexArray();

    let TempVao = this.#gl.createVertexArray();
		// Generate enough Vaos for each denoise pass
    let PostVao = new Array(5).map(() => this.#gl.createVertexArray());

    // Internal render engine Functions
    let frameCycle = engineState => {
      if (this.#halt) return;
      let timeStamp = performance.now();
      // Update Textures
      this.#updateTextureAtlas();
      this.#updatePbrAtlas();
      this.#updateTranslucencyAtlas();
      // build bounding boxes for scene first
      this.updatePrimaryLightSources();
      // Check if recompile is required
      if (engineState.filter !== this.config.filter || engineState.renderQuality !== this.config.renderQuality) {
        resize();
        engineState = prepareEngine();
      }
      // Swap antialiasing programm if needed
      if (engineState.antialiasing !== this.config.antialiasing) {
        engineState.antialiasing = this.config.antialiasing;
        // Use internal antialiasing variable for actual state of antialiasing.
        let val = this.config.antialiasing.toLowerCase();
        switch (val) {
          case 'fxaa':
            this.#antialiasing = val
            this.#AAObject = new FXAA(this.#gl);
            break;
          case 'taa':
            this.#antialiasing = val
            this.#AAObject = new TAA(this.#gl);
            break;
          default:
            this.#antialiasing = undefined
            this.#AAObject = undefined;
        }
      }
      // Render new Image, work through queue
      renderFrame(engineState);
      // Update frame counter
      engineState.intermediateFrames ++;
      engineState.temporalFrame = (engineState.temporalFrame + 1) % this.config.temporalSamples;
      // Calculate Fps
			let timeDifference = timeStamp - engineState.lastTimeStamp;
      if (timeDifference > 500) {
        this.fps = (1000 * engineState.intermediateFrames / timeDifference).toFixed(0);
        engineState.lastTimeStamp = timeStamp;
        engineState.intermediateFrames = 0;
      }
      // Request browser to render frame with hardware acceleration
      setTimeout(function () {
        requestAnimationFrame(() => frameCycle(engineState))
      }, 1000 / this.fpsLimit);
    }

    let pathtracingPass = engineState => {

      let jitter = {x: 0, y: 0};
      if (this.#antialiasing !== undefined && (this.#antialiasing === 'taa')) jitter = this.#AAObject.jitter(this.#canvas);
      // Calculate projection matrix
      let dir = {x: this.camera.fx + jitter.x, y: this.camera.fy + jitter.y};

      let invFov = 1 / this.camera.fov;
      let heightInvWidthFov = this.#canvas.height * invFov / this.#canvas.width;
      let viewMatrix = [
        Math.cos(dir.x) * heightInvWidthFov,            0,                          Math.sin(dir.x) * heightInvWidthFov,
      - Math.sin(dir.x) * Math.sin(dir.y) * invFov,     Math.cos(dir.y) * invFov,   Math.cos(dir.x) * Math.sin(dir.y) * invFov,
      - Math.sin(dir.x) * Math.cos(dir.y),            - Math.sin(dir.y),            Math.cos(dir.x) * Math.cos(dir.y)
      ];

      this.#gl.bindVertexArray(Vao);
      this.#gl.useProgram(Program);

      [this.#geometryTexture, this.#sceneTexture, this.#pbrAtlas, this.#translucencyAtlas, this.#textureAtlas, this.#lightTexture].forEach((texture, i) => {
        this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, texture);
      });
      // Set uniforms for shaders
      // console.log(engineState.intermediateFrames);
      let uniformValues = [
        // 3d position of camera
        [this.camera.x, this.camera.y, this.camera.z],
        // View rotation and TAA jitter
        [true, viewMatrix],
        // amount of samples per ray
        [this.config.samplesPerRay],
        // max reflections of ray
        [this.config.maxReflections],
        // min importancy of light ray
        [this.config.minImportancy],
        // render for filter or not
        [this.config.filter],
        // render for temporal or not
        [this.config.temporal],
        // ambient background color
        [this.scene.ambientLight[0], this.scene.ambientLight[1], this.scene.ambientLight[2]],
        // random seed for monte carlo pathtracing
        [this.config.temporal ? engineState.temporalFrame : 0],
        // width of textures
        [Math.floor(2048 / this.scene.standardTextureSizes[0])],
        // whole triangle based geometry scene graph, triangle attributes for scene graph
        [0], [1],
        // pbr texture, translucency texture, texture
        [2], [3], [4],
        // data texture of all primary light sources
        [5]
      ];

      PathtracingUniformFunctionTypes.forEach((functionType, i) => this.#gl[functionType](engineState.pathtracingUniformLocations[i], ... uniformValues[i]));

      // Fill UBO
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, UboBuffer);
      // Get transformation matrices elements and set them in buffer
      Transform.buildWGL2Arrays().forEach((array, i) => this.#gl.bufferSubData(this.#gl.UNIFORM_BUFFER, UboVariableOffsets[i], array, 0));
      // Bind buffer
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
      // Set buffers
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, triangleIdBuffer);
      this.#gl.bufferData(this.#gl.ARRAY_BUFFER, this.#triangleIdBufferArray, this.#gl.DYNAMIC_DRAW);
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, vertexIdBuffer);
      this.#gl.bufferData(this.#gl.ARRAY_BUFFER, new Int32Array([0, 1, 2]), this.#gl.STATIC_DRAW);
      // Actual drawcall
      this.#gl.drawArraysInstanced(this.#gl.TRIANGLES, 0, 3, this.#bufferLength);
    }

    let renderFrame = engineState => {
      // Configure where the final image should go
      if (this.config.temporal || this.config.filter || this.#antialiasing) {
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, Framebuffer);
        this.#gl.drawBuffers([
          this.#gl.COLOR_ATTACHMENT0,
          this.#gl.COLOR_ATTACHMENT1,
          this.#gl.COLOR_ATTACHMENT2,
          this.#gl.COLOR_ATTACHMENT3,
          this.#gl.COLOR_ATTACHMENT4,
          this.#gl.COLOR_ATTACHMENT5
        ]);
  
        // Configure framebuffer for color and depth
        if (this.config.temporal) {
          // Rotate textures for temporal filter
          TempTexture.unshift(TempTexture.pop());
          TempIpTexture.unshift(TempIpTexture.pop());
          TempIdTexture.unshift(TempIdTexture.pop());
          TempOriginalIdTexture.unshift(TempOriginalIdTexture.pop());

          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, TempTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT1, this.#gl.TEXTURE_2D, TempIpTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT2, this.#gl.TEXTURE_2D, OriginalRenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT3, this.#gl.TEXTURE_2D, IdRenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT4, this.#gl.TEXTURE_2D, TempOriginalIdTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT5, this.#gl.TEXTURE_2D, TempIdTexture[0], 0);
          OriginalIdRenderTexture = TempOriginalIdTexture[0];
        } else if (this.config.filter) {
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, RenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT1, this.#gl.TEXTURE_2D, IpRenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT2, this.#gl.TEXTURE_2D, OriginalRenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT3, this.#gl.TEXTURE_2D, IdRenderTexture[0], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT4, this.#gl.TEXTURE_2D, OriginalIdRenderTexture, 0);
        } else if (this.#antialiasing) {
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, this.#AAObject.textureIn, 0);
        }
        this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.DEPTH_ATTACHMENT, this.#gl.TEXTURE_2D, DepthTexture[0], 0);
      }

      // Clear depth and color buffers from last frame
      this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
      pathtracingPass(engineState);

      if (this.config.temporal) {
        if (this.config.filter || this.#antialiasing) {
            // Temporal sample averaging
          this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, TempFramebuffer);
          // Set attachments to use for framebuffer
          this.#gl.drawBuffers([
            this.#gl.COLOR_ATTACHMENT0,
            this.#gl.COLOR_ATTACHMENT1
          ]);

          // Configure framebuffer for color and depth
          if (this.config.filter) {
            this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, RenderTexture[0], 0);
            this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT1, this.#gl.TEXTURE_2D, IpRenderTexture[0], 0);
          } else if (this.#antialiasing) {
            this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, this.#AAObject.textureIn, 0);
          }
        } else {
          // Render to canvas now
          this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
        }

        [TempTexture, TempIpTexture, TempIdTexture, TempOriginalIdTexture].flat().forEach((item, i) => {
          this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
          this.#gl.bindTexture(this.#gl.TEXTURE_2D, item);
        });

        this.#gl.bindVertexArray(TempVao);
        this.#gl.useProgram(TempProgram);

        this.#gl.uniform1i(TempHdrLocation, this.config.hdr);

        for (let i = 0; i < this.config.temporalSamples; i++) {
          this.#gl.uniform1i(TempTex[i], i);
          this.#gl.uniform1i(TempIpTex[i], this.config.temporalSamples + i);
          this.#gl.uniform1i(TempIdTex[i], 2 * this.config.temporalSamples + i);
          this.#gl.uniform1i(TempOriginalIdTex[i], 3 * this.config.temporalSamples + i);
        }
        
        // PostTemporal averaging processing drawcall
        this.#gl.drawArrays(this.#gl.TRIANGLES, 0, 6);
      }

      if (this.config.filter) {
        // Apply post processing filter
        let n = 0;
        let nId = 0;
        let nOriginal = 0;
        for (let i = 0; i < this.config.firstPasses + this.config.secondPasses; i++) {
          // Look for next free compatible program slot
          let np = (i % 2) ^ 1;
          let npOriginal = ((i - this.config.firstPasses) % 2) ^ 1;
          if (this.config.firstPasses <= i) np += 2;
          // Configure where the final image should go
          this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, PostFramebuffer[n]);
          // Set attachments to use for framebuffer
          this.#gl.drawBuffers([
            this.#gl.COLOR_ATTACHMENT0,
            this.#gl.COLOR_ATTACHMENT1,
            this.#gl.COLOR_ATTACHMENT2
          ]);
          // Configure framebuffer for color and depth
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, RenderTexture[np], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT1, this.#gl.TEXTURE_2D, IpRenderTexture[np], 0);
          if (this.config.firstPasses <= i - 2) this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT2, this.#gl.TEXTURE_2D, OriginalRenderTexture[npOriginal], 0);
          else this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT2, this.#gl.TEXTURE_2D, IdRenderTexture[np], 0);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.DEPTH_ATTACHMENT, this.#gl.TEXTURE_2D, DepthTexture[np], 0);
          // Clear depth and color buffers from last frame
          this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
          // Push pre rendered textures to next shader (post processing)
          [RenderTexture[n], IpRenderTexture[n], OriginalRenderTexture[nOriginal], IdRenderTexture[nId], OriginalIdRenderTexture].forEach((item, i) => {
            this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
            this.#gl.bindTexture(this.#gl.TEXTURE_2D, item);
          });
          // Switch program and Vao
          this.#gl.useProgram(PostProgram[n]);
          this.#gl.bindVertexArray(PostVao[n]);
          // Pass pre rendered texture to shader
          this.#gl.uniform1i(RenderTex[n], 0);
          this.#gl.uniform1i(IpRenderTex[n], 1);
          // Pass original color texture to GPU
          this.#gl.uniform1i(OriginalRenderTex[n], 2);
          // Pass vertex_id texture to GPU
          this.#gl.uniform1i(IdRenderTex[n], 3);
          // Pass vertex_id of original vertex as a texture to GPU
          this.#gl.uniform1i(OriginalIdRenderTex[n], 4);
          // Post processing drawcall
          this.#gl.drawArrays(this.#gl.TRIANGLES, 0, 6);
          // Save current program slot in n for next pass
          n = np;

          if (this.config.firstPasses <= i) nOriginal = npOriginal;
          else nId = np;
        }

        // Last denoise pass
        this.#gl.drawBuffers([this.#gl.COLOR_ATTACHMENT0, this.#gl.COLOR_ATTACHMENT1]);
        // Configure framebuffer for color and depth
        if (this.#antialiasing) {
          // Configure where the final image should go
          this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, PostFramebuffer[4]);
          this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, this.#AAObject.textureIn, 0);
        } else {
          // Render to canvas now
          this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
        }

        let index = 2 + (this.config.firstPasses + this.config.secondPasses) % 2;
        let indexId = this.config.firstPasses % 2;
        let indexOriginal = this.config.secondPasses % 2;
        // Push pre rendered textures to next shader (post processing)
        [RenderTexture[index], IpRenderTexture[index], OriginalRenderTexture[indexOriginal], IdRenderTexture[indexId], OriginalIdRenderTexture].forEach((item, i) => {
          this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
          this.#gl.bindTexture(this.#gl.TEXTURE_2D, item);
        });
        // Switch program and VAO
        this.#gl.useProgram(PostProgram[4]);
        this.#gl.bindVertexArray(PostVao[4]);
        // Pass pre rendered texture to shader
        this.#gl.uniform1i(RenderTex[4], 0);
        this.#gl.uniform1i(IpRenderTex[4], 1);
        // Pass original color texture to GPU
        this.#gl.uniform1i(OriginalRenderTex[4], 2);
        // Pass vertex_id texture to GPU
        this.#gl.uniform1i(IdRenderTex[4], 3);
        // Pass vertex_id of original vertex as a texture to GPU
        this.#gl.uniform1i(OriginalIdRenderTex[4], 4);
        // Pass hdr variable to last post processing shader
        this.#gl.uniform1i(HdrLocation, this.config.hdr);
        // Post processing drawcall
        this.#gl.drawArrays(this.#gl.TRIANGLES, 0, 6);
      }

      // Apply antialiasing shader if enabled
      if (this.#antialiasing) this.#AAObject.renderFrame();
    }

    let prepareEngine = () => {
      let initialState = {
        // Attributes to meassure frames per second
        intermediateFrames: 0,
        lastTimeStamp: performance.now(),
        // Count frames to match with temporal accumulation
        temporalFrame: 0,
        // Parameters to compare against current state of the engine and recompile shaders on change
        filter: this.config.filter,
        renderQuality: this.config.renderQuality
      };

      let newLine = `
      `;
      // Build tempShader
      this.#tempGlsl = `#version 300 es
      precision highp float;
      in vec2 clipSpace;
      uniform int hdr;
      `;

      for (let i = 0; i < this.config.temporalSamples; i++) {
        this.#tempGlsl += 'uniform sampler2D cache' + i + ';' + newLine;
        this.#tempGlsl += 'uniform sampler2D cacheIp' + i + ';' + newLine;
        this.#tempGlsl += 'uniform sampler2D cacheId' + i + ';' + newLine;
        this.#tempGlsl += 'uniform sampler2D cacheOriginalId' + i + ';' + newLine;
      }

      if (this.config.filter) {
        this.#tempGlsl += `
        layout(location = 0) out vec4 renderColor;
        layout(location = 1) out vec4 renderColorIp;
        `;
      } else {
        this.#tempGlsl += `
        layout(location = 0) out vec4 renderColor;
        `;
      }

      this.#tempGlsl += `void main () {
        ivec2 texel = ivec2(vec2(textureSize(cache0, 0)) * clipSpace);
        vec4 id = texelFetch(cacheId0, texel, 0);
        vec4 originalId = texelFetch(cacheOriginalId0, texel, 0);
        float counter = 1.0;
        float glassCounter = 1.0;
        
        float centerW = texelFetch(cache0, texel, 0).w;
        vec3 color = texelFetch(cache0, texel, 0).xyz + texelFetch(cacheIp0, texel, 0).xyz * 256.0;
        float glassFilter = texelFetch(cacheIp0, texel, 0).w;
      `;

      for (let i = 1; i < this.config.temporalSamples; i += 4) {
        this.#tempGlsl += 'mat4 c' + i + ' = mat4(';
        for (let j = i; j < i + 3; j++) this.#tempGlsl += (j < this.config.temporalSamples ? 'texelFetch(cache' + j + ', texel, 0),' : 'vec4(0),') + newLine;
        this.#tempGlsl += (i + 3 < this.config.temporalSamples ? 'texelFetch(cache' + (i + 3) + ', texel, 0) ' + newLine + ' ); ' : 'vec4(0) ' + newLine + '); ') + newLine;

        this.#tempGlsl += 'mat4 ip' + i + ' = mat4(';
        for (let j = i; j < i + 3; j++) this.#tempGlsl += (j < this.config.temporalSamples ? 'texelFetch(cacheIp' + j + ', texel, 0),' : 'vec4(0),') + newLine;
        this.#tempGlsl += (i + 3 < this.config.temporalSamples ? 'texelFetch(cacheIp' + (i + 3) + ', texel, 0) ' + newLine + '); ' : 'vec4(0) ' + newLine + '); ') + newLine;

        this.#tempGlsl += 'mat4 id' + i + ' = mat4(';
        for (let j = i; j < i + 3; j++) this.#tempGlsl += (j < this.config.temporalSamples ? 'texelFetch(cacheId' + j + ', texel, 0),' : 'vec4(0),') + newLine;
        this.#tempGlsl += (i + 3 < this.config.temporalSamples ? 'texelFetch(cacheId' + (i + 3) + ', texel, 0) ' + newLine + '); ' : 'vec4(0) ' + newLine + '); ') + newLine;

        this.#tempGlsl += 'mat4 originalId' + i + ' = mat4(';
        for (let j = i; j < i + 3; j++) this.#tempGlsl += (j < this.config.temporalSamples ? 'texelFetch(cacheOriginalId' + j + ', texel, 0),' : 'vec4(0),') + newLine;
        this.#tempGlsl += (i + 3 < this.config.temporalSamples ? 'texelFetch(cacheOriginalId' + (i + 3) + ', texel, 0) ' + newLine + '); ' : 'vec4(0) ' + newLine + '); ') + newLine;

        this.#tempGlsl += `
        for (int i = 0; i < 4; i++) if (id` + i + `[i].xyzw == id.xyzw) {
          color += c` + i + `[i].xyz + ip` + i + `[i].xyz * 256.0;
          counter ++;
        }
        for (int i = 0; i < 4; i++) if (originalId` + i + `[i].xyzw == originalId.xyzw) {
          glassFilter += ip` + i + `[i].w;
          glassCounter ++;
        }
        `;
      }

      this.#tempGlsl += `
      color /= counter;
      glassFilter /= glassCounter;
      `;

      if (this.config.filter) {
        this.#tempGlsl += `
          renderColor = vec4(mod(color, 1.0), centerW);
          // 16 bit HDR for improved filtering
          renderColorIp = vec4(floor(color) / 256.0, glassFilter);
        }`;
      } else {
        this.#tempGlsl += `
          if (hdr == 1) {
            // Apply Reinhard tone mapping
            color = color / (color + vec3(1));
            // Gamma correction
            float gamma = 0.8;
            color = pow(4.0 * color, vec3(1.0 / gamma)) / 4.0 * 1.3;
            renderColor = vec4(color, centerW);
          } else {
            // Set color of object itself
            renderColor = vec4(color, centerW);
          }
          renderColor = vec4(color, centerW);
        }`;
      }
      // Force update textures by resetting texture Lists
      this.#textureList = [];
      this.#pbrList = [];
      this.#translucencyList = [];
      // Compile shaders and link them into Program global
      let vertexShader = Network.fetchSync('shaders/pathtracer_vertex.glsl');
      let fragmentShader = Network.fetchSync('shaders/pathtracer_fragment.glsl');
      let firstFilterShader = Network.fetchSync('shaders/pathtracer_first_filter.glsl');
      let secondFilterShader = Network.fetchSync('shaders/pathtracer_second_filter.glsl');
      let finalFIlterShader = Network.fetchSync('shaders/pathtracer_final_filter.glsl');
      // Calculate max possible transforms
      const MAX_TRANSFORMS = Math.floor((Math.min(this.#gl.getParameter(this.#gl.MAX_VERTEX_UNIFORM_VECTORS), this.#gl.getParameter(this.#gl.MAX_FRAGMENT_UNIFORM_VECTORS)) - 16) * 0.25);
      console.log('MAX_TRANSFORMS evaluated to', MAX_TRANSFORMS);
      vertexShader = GLLib.addCompileTimeConstant(vertexShader, 'MAX_TRANSFORMS', MAX_TRANSFORMS);
      fragmentShader = GLLib.addCompileTimeConstant(fragmentShader, 'MAX_TRANSFORMS', MAX_TRANSFORMS);

      Program = GLLib.compile (this.#gl, vertexShader, fragmentShader);
      TempProgram = GLLib.compile (this.#gl, GLLib.postVertex, this.#tempGlsl);
      // Compile shaders and link them into PostProgram global
      for (let i = 0; i < 2; i++) PostProgram[i] = GLLib.compile (this.#gl, GLLib.postVertex, firstFilterShader);
      // Compile shaders and link them into PostProgram global
      for (let i = 2; i < 4; i++) PostProgram[i] = GLLib.compile (this.#gl, GLLib.postVertex, secondFilterShader);
      // Compile shaders and link them into PostProgram global
      PostProgram[4] = GLLib.compile (this.#gl, GLLib.postVertex, finalFIlterShader);
      // Create global vertex array object (Vao)
      this.#gl.bindVertexArray(Vao);
      // Bind uniforms to Program
      initialState.pathtracingUniformLocations = PathtracingUniformLocationIdentifiers.map(identifier => this.#gl.getUniformLocation(Program, identifier));
      // Create UBO objects
      let BlockIndex = this.#gl.getUniformBlockIndex(Program, 'transformMatrix');
      // Get the size of the Uniform Block in bytes
      let BlockSize = this.#gl.getActiveUniformBlockParameter(Program, BlockIndex, this.#gl.UNIFORM_BLOCK_DATA_SIZE);
      
      UboBuffer = this.#gl.createBuffer();
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, UboBuffer);
      this.#gl.bufferData(this.#gl.UNIFORM_BUFFER, BlockSize, this.#gl.DYNAMIC_DRAW);
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
      this.#gl.bindBufferBase(this.#gl.UNIFORM_BUFFER, 0, UboBuffer);

      UboVariableIndices = this.#gl.getUniformIndices( Program, ['rotation', 'shift']);
      UboVariableOffsets = this.#gl.getActiveUniforms(
        Program,
        UboVariableIndices,
        this.#gl.UNIFORM_OFFSET
      );

      let index = this.#gl.getUniformBlockIndex(Program, 'transformMatrix');
      this.#gl.uniformBlockBinding(Program, index, 0);
      // Enable depth buffer and therefore overlapping vertices
      this.#gl.disable(this.#gl.BLEND);
      this.#gl.enable(this.#gl.DEPTH_TEST);
      this.#gl.depthMask(true);
      // Cull (exclude from rendering) hidden vertices at the other side of objects
      this.#gl.enable(this.#gl.CULL_FACE);
      // Set clear color for framebuffer
      this.#gl.clearColor(0, 0, 0, 0);
      // Define Program with its currently bound shaders as the program to use for the webgl2 context
      this.#gl.useProgram(Program);
      this.#pbrAtlas = this.#gl.createTexture();
      this.#translucencyAtlas = this.#gl.createTexture();
      this.#textureAtlas = this.#gl.createTexture();
      // Create texture for all primary light sources in scene
      this.#lightTexture = this.#gl.createTexture();
      // Init textures containing all information about the scene to enable pathtracing
      this.#geometryTexture = this.#gl.createTexture();
      this.#sceneTexture = this.#gl.createTexture();
      // Create buffers
      [triangleIdBuffer, vertexIdBuffer] = [this.#gl.createBuffer(), this.#gl.createBuffer()];
      
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, triangleIdBuffer);
      this.#gl.enableVertexAttribArray(0);
      this.#gl.vertexAttribIPointer(0, 1, this.#gl.INT, false, 0, 0);
      this.#gl.vertexAttribDivisor(0, 1);

      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, vertexIdBuffer);
      this.#gl.enableVertexAttribArray(1);
      this.#gl.vertexAttribIPointer(1, 1, this.#gl.INT, false, 0, 0);
      // Create frame buffers and textures to be rendered to
      [Framebuffer, OriginalIdRenderTexture] = [this.#gl.createFramebuffer(), this.#gl.createTexture()];
      this.#gl.bindVertexArray(TempVao);
      this.#gl.useProgram(TempProgram);
      TempHdrLocation = this.#gl.getUniformLocation(TempProgram, 'hdr');
      
      for (let i = 0; i < this.config.temporalSamples; i++) {
        TempTex[i] = this.#gl.getUniformLocation(TempProgram, 'cache' + i);
        TempIpTex[i] = this.#gl.getUniformLocation(TempProgram, 'cacheIp' + i);
        TempIdTex[i] = this.#gl.getUniformLocation(TempProgram, 'cacheId' + i);
        TempOriginalIdTex[i] = this.#gl.getUniformLocation(TempProgram, 'cacheOriginalId' + i);
      }
      
      let TempVertexBuffer = this.#gl.createBuffer();
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, TempVertexBuffer);
      this.#gl.enableVertexAttribArray(0);
      this.#gl.vertexAttribPointer(0, 2, this.#gl.FLOAT, false, 0, 0);
      // Fill buffer with data for two verices
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, TempVertexBuffer);
      this.#gl.bufferData(this.#gl.ARRAY_BUFFER, Float32Array.from([0,0,1,0,0,1,1,1,0,1,1,0]), this.#gl.DYNAMIC_DRAW);
      TempFramebuffer = this.#gl.createFramebuffer();
      
      for (let i = 0; i < 5; i++){
        // Create post program buffers and uniforms
        this.#gl.bindVertexArray(PostVao[i]);
        this.#gl.useProgram(PostProgram[i]);
        // Bind uniforms
        RenderTex[i] = this.#gl.getUniformLocation(PostProgram[i], 'preRenderColor');
        IpRenderTex[i] = this.#gl.getUniformLocation(PostProgram[i], 'preRenderColorIp');
        OriginalRenderTex[i] = this.#gl.getUniformLocation(PostProgram[i], 'preRenderOriginalColor');
        IdRenderTex[i] = this.#gl.getUniformLocation(PostProgram[i], 'preRenderId');
        OriginalIdRenderTex[i] = this.#gl.getUniformLocation(PostProgram[i], 'preRenderOriginalId');
        if (i === 4) HdrLocation = this.#gl.getUniformLocation(PostProgram[i], 'hdr');
        PostVertexBuffer[i] = this.#gl.createBuffer();
        this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, PostVertexBuffer[i]);
        this.#gl.enableVertexAttribArray(0);
        this.#gl.vertexAttribPointer(0, 2, this.#gl.FLOAT, false, 0, 0);
        // Fill buffer with data for two verices
        this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, PostVertexBuffer[i]);
        this.#gl.bufferData(this.#gl.ARRAY_BUFFER, Float32Array.from([0,0,1,0,0,1,1,1,0,1,1,0]), this.#gl.DYNAMIC_DRAW);
        PostFramebuffer[i] = this.#gl.createFramebuffer();
      }
      
      renderTextureBuilder();
      // Reload / Rebuild scene graph after resize or page reload
      this.updateScene();
      // Return initialized objects for engine.
      return initialState;
    }

    let renderTextureBuilder = () => {
      // Init textures for denoiser
      [TempTexture, TempIpTexture, TempIdTexture, TempOriginalIdTexture, RenderTexture, IpRenderTexture, OriginalRenderTexture, IdRenderTexture, [OriginalIdRenderTexture]].forEach(parent => {
        parent.forEach(item => {
          // console.log(this);
          this.#gl.bindTexture(this.#gl.TEXTURE_2D, item);
          this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.canvas.width, this.#gl.canvas.height, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
          GLLib.setTexParams(this.#gl);
        });
      });
      // Init single channel depth textures
      DepthTexture.forEach((item) => {
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, item);
        this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.DEPTH_COMPONENT24, this.#gl.canvas.width, this.#gl.canvas.height, 0, this.#gl.DEPTH_COMPONENT, this.#gl.UNSIGNED_INT, null);
        GLLib.setTexParams(this.#gl);
      });
    }

    // Function to handle canvas resize
    let resize = () => {
      this.canvas.width = this.canvas.clientWidth * this.config.renderQuality;
      this.canvas.height = this.canvas.clientHeight * this.config.renderQuality;
      this.#gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      // Rebuild textures with every resize
      renderTextureBuilder();
      // rt.updatePrimaryLightSources();
      if (this.#AAObject !== undefined) this.#AAObject.buildTexture();

      this.config.firstPasses = 3;//Math.max(Math.round(Math.min(canvas.width, canvas.height) / 600), 3);
      this.config.secondPasses = 3;//Math.max(Math.round(Math.min(canvas.width, canvas.height) / 500), 3);
    }
    // Init canvas parameters and textures with resize
    resize();
    // Handle canvas resize
    // Init canvas parameters and textures with resize
    window.addEventListener('resize', resize);
    // Prepare Renderengine
    let engineState = prepareEngine();
    // resize();
    // Begin frame cycle
    requestAnimationFrame(() => frameCycle(engineState));
  }
}
