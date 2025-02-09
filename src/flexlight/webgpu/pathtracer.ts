

import { RendererType } from "../common/renderer.js";
import { RendererWGPU, WebGPUReferences } from "./renderer-webgpu.js";
import { Scene } from "../common/scene/scene.js";
import { Camera } from "../common/scene/camera.js";
import { Config } from "../common/config.js";
import { Prototype } from "../common/scene/prototype.js";
import { Float16Array } from "../common/buffer/float-16-array.js";
import { BufferToGPUBuffer } from "./buffer-to-gpu/buffer-to-gpubuffer.js";
import { BufferToRGBA16 } from "./buffer-to-gpu/buffer-to-rgba16.js";
import { BufferToRGBA32 } from "./buffer-to-gpu/buffer-to-rgba32.js";
import { BufferToRGBA8 } from "./buffer-to-gpu/buffer-to-rgba8.js";
import { EnvironmentMapWebGPU } from "./environment-map-webgpu.js";
import { Texture } from "../common/scene/texture.js";
// import { AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture, Texture } from "../common/scene/texture.js";
import { Matrix, moore_penrose, POW32M1, Vector } from "../common/lib/math.js";
import { AntialiasingModule } from "./antialiasing/antialiasing-module.js";
import { WebGPUAntialiasingType } from "./antialiasing/antialiasing-module.js";

import { FXAA } from "./antialiasing/fxaa.js";
import { TAA } from "./antialiasing/taa.js";

// Ignore all shader imports, the bundler will handle them as intended.
// @ts-ignore
import PathtracerDepthShader from './shaders/pathtracer-depth.wgsl';
// @ts-ignore
import PathtracerRasterShader from './shaders/pathtracer-raster.wgsl';
// @ts-ignore
import PathtracerShiftShader from './shaders/pathtracer-shift.wgsl';
// @ts-ignore
import PathtracerComputeShader from './shaders/pathtracer-compute.wgsl';
// @ts-ignore
import PathtracerSelectiveAverageShader from './shaders/pathtracer-selective-average.wgsl';
// @ts-ignore
import PathtracerReprojectShader from './shaders/pathtracer-reproject.wgsl';
// @ts-ignore
import PathtracerCanvasShader from './shaders/canvas.wgsl';


interface PathTracerPipelines {
  depthPipeline: GPURenderPipeline;
  rasterPipeline: GPURenderPipeline;

  computePipeline: GPUComputePipeline;
  shiftPipeline: GPUComputePipeline | undefined;
  selectiveAveragePipeline: GPUComputePipeline | undefined;
  // reprojectPipeline: GPUComputePipeline | undefined;
  canvasPipeline: GPUComputePipeline;
}


interface CanvasSizeDependentResources {
  depthBuffer: GPUBuffer;
  offsetBuffer: GPUBuffer;
  absolutePositionTexture: GPUTexture;
  uvTexture: GPUTexture;

  canvasIn: GPUTexture;
  shiftTargetFloat: GPUTexture | undefined;
  shiftTargetUint: GPUTexture | undefined;
  accumulatedTargetFloat: GPUTexture | undefined;
  accumulatedTargetUint: GPUTexture | undefined;
  shiftLock: GPUBuffer | undefined;
  temporalIn: GPUTexture | undefined;
}


interface PathTracerBindGroupLayouts {
  depthGroupLayout: GPUBindGroupLayout;
  rasterRenderGroupLayout: GPUBindGroupLayout;
  rasterGeometryGroupLayout: GPUBindGroupLayout;
  rasterDynamicGroupLayout: GPUBindGroupLayout;
  computeGeometryGroupLayout: GPUBindGroupLayout;
  computeTextureGroupLayout: GPUBindGroupLayout;
  computeDynamicGroupLayout: GPUBindGroupLayout;
  computeRenderGroupLayout: GPUBindGroupLayout;
  shiftGroupLayout: GPUBindGroupLayout | undefined;
  selectiveAverageGroupLayout: GPUBindGroupLayout | undefined;
  // reprojectGroupLayout: GPUBindGroupLayout | undefined;
  temporalDynamicGroupLayout: GPUBindGroupLayout | undefined;
  postDynamicGroupLayout: GPUBindGroupLayout;
  canvasGroupLayout: GPUBindGroupLayout;
}


interface PathTracerGPUBufferManagers {
  // Pototype GPU Buffer Managers
  triangleGPUManager: BufferToRGBA16<Float16Array>;
  BVHGPUManager: BufferToRGBA32<Uint32Array>;
  boundingVertexGPUManager: BufferToRGBA16<Float16Array>;
  // Light GPU Managers
  pointLightGPUManager: BufferToGPUBuffer<Float32Array>;
  // Texture GPU Managers
  textureInstanceGPUManager: BufferToGPUBuffer<Uint32Array>;
  textureDataGPUManager: BufferToRGBA8<Uint8Array>;
  environmentMapGPUManager: EnvironmentMapWebGPU;
  // Scene GPU Managers
  instanceUintGPUManager: BufferToGPUBuffer<Uint32Array>;
  instanceTransformGPUManager: BufferToGPUBuffer<Float32Array>;
  instanceMaterialGPUManager: BufferToGPUBuffer<Float32Array>;
  instanceBVHGPUManager: BufferToGPUBuffer<Uint32Array>;
  instanceBoundingVertexGPUManager: BufferToGPUBuffer<Float32Array>;
}

interface EngineState {
  temporal: boolean;
  temporalSamples: number;
  renderQuality: number;
  antialiasing: WebGPUAntialiasingType;
}

// let rasterRenderFormats = ["rgba32float", "rg32float"];

const TEMPORAL_MAX = 2 ** 23 - 1;

export class PathTracerWGPU extends RendererWGPU {
  readonly type: RendererType = "pathtracer";

  private resizeHook: (() => void) | undefined;
  
  private canvasSizeDependentResources: CanvasSizeDependentResources | undefined;
  private antialiasingModule: AntialiasingModule | undefined;
  private engineState: EngineState = {
    temporal: false, temporalSamples: 0,
    renderQuality: 0, antialiasing: undefined
  };

  // Create new PathTracer from canvas and setup movement
  constructor (canvas: HTMLCanvasElement, scene: Scene, camera: Camera, config: Config) {
    super(scene, canvas, camera, config);
  }

  halt = (): boolean => {
    // Unbind GPUBuffers
    Prototype.triangleManager.releaseGPUBuffer();
    Prototype.BVHManager.releaseGPUBuffer();
    Prototype.boundingVertexManager.releaseGPUBuffer();
    Texture.textureInstanceBufferManager.releaseGPUBuffer();
    Texture.textureDataBufferManager.releaseGPUBuffer();
    this.scene.instanceUintManager.releaseGPUBuffer();
    this.scene.instanceTransformManager.releaseGPUBuffer();
    this.scene.instanceMaterialManager.releaseGPUBuffer();
    this.scene.instanceBVHManager.releaseGPUBuffer();
    this.scene.instanceBoundingVertexManager.releaseGPUBuffer();
    this.scene.pointLightManager.releaseGPUBuffer();
    // Also release environment map
    this.scene.environmentMapManager.releaseGPUBuffer();

    let wasRunning = this.isRunning;
    this.isRunning = false;
    if (this.resizeHook) window.removeEventListener("resize", this.resizeHook);
    return wasRunning;
  }

  
  private resize (device: GPUDevice): void {
    let width = Math.round(this.canvas.clientWidth * this.config.renderQuality);
    let height = Math.round(this.canvas.clientHeight * this.config.renderQuality);

    this.canvas.width = width;
    this.canvas.height = height;

    // Free old textures and buffers if they exist
    if (this.canvasSizeDependentResources) for (let [_key, resource] of Object.entries(this.canvasSizeDependentResources)) try { resource.destroy(); } catch {}

    // Create new textures and buffers
    const depthBuffer = device.createBuffer({ size: height * width * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const offsetBuffer = device.createBuffer({ size: width * height * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const absolutePositionTexture = device.createTexture({ size: [width, height], format: "rgba32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    const uvTexture = device.createTexture({ size: [width, height], format: "rg32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    // Init temporal render texture
    const canvasIn = device.createTexture({ size: [width, height], format: "rgba32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });

    let temporalIn: GPUTexture | undefined = undefined;
    let shiftTargetFloat: GPUTexture | undefined = undefined;
    let shiftTargetUint: GPUTexture | undefined = undefined;
    let accumulatedTargetFloat: GPUTexture | undefined = undefined;
    let accumulatedTargetUint: GPUTexture | undefined = undefined;
    let shiftLock: GPUBuffer | undefined = undefined;

    if (this.config.temporal) {
      // Init canvas render texture
      temporalIn = device.createTexture({ size: [width, height, this.config.temporal ? 2 : 1], format: "rgba32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      // Init temporal screen space correction render target
      shiftTargetFloat = device.createTexture({ size: [width, height, 1], format: "rgba32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      shiftTargetUint = device.createTexture({ size: [width, height, 4], format: "rgba32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      // Init temporal screen space correction render target
      accumulatedTargetFloat = device.createTexture({ size: [width, height, 1], format: "rgba32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      accumulatedTargetUint = device.createTexture({ size: [width, height, 4], format: "rgba32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      // Init shift lock buffer
      shiftLock = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
      device.queue.writeBuffer(shiftLock, 0, new Uint32Array(new Array(width * height).fill(POW32M1)));
    } else {
      // Create dummy shift target texture for compute shader pass
      shiftTargetFloat = device.createTexture({ size: [1, 1, 1], format: "rgba32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      shiftTargetUint = device.createTexture({ size: [1, 1, 1], format: "rgba32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    }

    // Init antialiasing module texture if antialiasing module exists
    if (this.antialiasingModule) this.antialiasingModule.createTexture();

    // Create new canvas size dependent resources
    this.canvasSizeDependentResources = {
      depthBuffer, offsetBuffer, absolutePositionTexture, uvTexture, canvasIn,
      temporalIn, shiftTargetFloat, shiftTargetUint, accumulatedTargetFloat, accumulatedTargetUint, shiftLock
    }
  }
  
  async render() {
    // Check if renderer is already running
    if (this.isRunning) throw new Error("Renderer already up and running!");

    // Request webgpu references
    const { device, context }: WebGPUReferences = await this.requestWebGPUReferences();
    // Get prefered canvas format
    const preferedCanvasFormat = "rgba8unorm"; // await navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({ device: device, format: preferedCanvasFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    this.prepareEngine(device, context);
  }
  

  private createBindGroupLayouts(device: GPUDevice): PathTracerBindGroupLayouts {
    const depthGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "storage" } }  // depth
      ]
    });

    const rasterRenderGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },                                                 // depth
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "storage" } },                                                           // offset texture
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } },  // 3d positions
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: "write-only", format: "rg32float", viewDimension: "2d" } }     // uvs
      ]
    });

    const rasterGeometryGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } }  // prototype triangles
      ]
    });
    
    const rasterDynamicGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // uniforms
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // uniforms
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },                 // instances uint
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },                 // instances transform
      ]
    });

    const computeGeometryGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } }, // prototype triangles
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } },               // prototype bvh
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } }, // prototype bounding vertices
      ]
    });

    const computeTextureGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } },               // texture data buffer
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },                                    // texture instance buffer
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float", viewDimension: "cube" } },                  // environment map
        { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: { type: "filtering" } },                                           // environment map sampler
      ]
    });

    const computeDynamicGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },            // uniforms
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },            // uniforms
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // light sources

        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // instances uint
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // instances transform
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // instances material
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // instances bvh
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },  // instances bounding vertices
      ]
    });

    const computeRenderGroupLayout: GPUBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d-array" } }, // output
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },                                                      // offset texture
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },                                              // 3d positions
        { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },                                              // uvs
        { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } },                   // shift target float
        { binding: 5, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } }                                  // shift target uint
      ]
    });

    let shiftGroupLayout: GPUBindGroupLayout | undefined = undefined;
    let selectiveAverageGroupLayout: GPUBindGroupLayout | undefined = undefined;
    // let reprojectGroupLayout: GPUBindGroupLayout | undefined = undefined;
    let temporalDynamicGroupLayout: GPUBindGroupLayout | undefined = undefined;
    if (this.config.temporal) {
      shiftGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d-array" } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32uint", viewDimension: "2d-array" } },
          // { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } }, 
          { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
        ]
      });

      selectiveAverageGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d-array" } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32uint", viewDimension: "2d-array" } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }
        ]
      });
      /*
      reprojectGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint", viewDimension: "2d-array" } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }
        ]
      });
      */

      temporalDynamicGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },          // uniforms
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },          // uniforms
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } } // instance transforms
        ]
      });
    }

    const postDynamicGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },   // uniforms
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }    // uniforms
      ]
    });

    const canvasGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },                                        // compute output
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm", viewDimension: "2d" } }   // canvas target
      ]
    });

    return {
      depthGroupLayout, rasterRenderGroupLayout, rasterGeometryGroupLayout, rasterDynamicGroupLayout,
      computeGeometryGroupLayout, computeTextureGroupLayout, computeDynamicGroupLayout, computeRenderGroupLayout,
      shiftGroupLayout, selectiveAverageGroupLayout, /*reprojectGroupLayout,*/ temporalDynamicGroupLayout,
      postDynamicGroupLayout, canvasGroupLayout
    }
  }

  private createPipelines(device: GPUDevice, bindGroupLayouts: PathTracerBindGroupLayouts): PathTracerPipelines {
    // Init pipelines
    const depthPipeline = this.createRenderPipeline(device, PathtracerDepthShader, "depth pipeline", bindGroupLayouts.depthGroupLayout, bindGroupLayouts.rasterGeometryGroupLayout, bindGroupLayouts.rasterDynamicGroupLayout);
    const rasterPipeline = this.createRenderPipeline(device, PathtracerRasterShader, "raster pipeline", bindGroupLayouts.rasterRenderGroupLayout, bindGroupLayouts.rasterGeometryGroupLayout, bindGroupLayouts.rasterDynamicGroupLayout);
    const computePipeline = this.createComputePipeline(device, PathtracerComputeShader, "compute pipeline",
      bindGroupLayouts.computeRenderGroupLayout, bindGroupLayouts.computeTextureGroupLayout, bindGroupLayouts.computeGeometryGroupLayout, bindGroupLayouts.computeDynamicGroupLayout);

    let shiftPipeline: GPUComputePipeline | undefined = undefined;
    let selectiveAveragePipeline: GPUComputePipeline | undefined = undefined;
    // let reprojectPipeline: GPUComputePipeline | undefined = undefined;

    if (this.config.temporal) {
      // Pipeline for screen space correction of motion before accumulation
      shiftPipeline = this.createComputePipeline(device, PathtracerShiftShader, "shift pipeline", bindGroupLayouts.shiftGroupLayout!, bindGroupLayouts.temporalDynamicGroupLayout!);
      // Pipeline for temporal accumulation
      selectiveAveragePipeline = this.createComputePipeline(device, PathtracerSelectiveAverageShader, "selective average pipeline", bindGroupLayouts.selectiveAverageGroupLayout!, bindGroupLayouts.temporalDynamicGroupLayout!);
      // Pipeline for temporal reprojection
      // reprojectPipeline = this.createComputePipeline(device, PathtracerReprojectShader, "reproject pipeline", bindGroupLayouts.reprojectGroupLayout!, bindGroupLayouts.temporalDynamicGroupLayout!);
    }

    // Pipeline for rendering to canvas
    const canvasPipeline = this.createComputePipeline(device, PathtracerCanvasShader, "canvas pipeline", bindGroupLayouts.canvasGroupLayout, bindGroupLayouts.postDynamicGroupLayout);
    
    return { depthPipeline, rasterPipeline, computePipeline, shiftPipeline, selectiveAveragePipeline, /*reprojectPipeline,*/ canvasPipeline };
  }
  
  private prepareEngine(device: GPUDevice, context: GPUCanvasContext) {
    // Halt renderer if still running
    this.halt();
    // Allow frame rendering
    this.isRunning = true;
    // Set engine state to config
    this.engineState = {
      temporal: this.config.temporal, temporalSamples: this.config.temporalSamples,
      renderQuality: this.config.renderQuality, antialiasing: this.config.antialiasing
    };

    const bindGroupLayouts = this.createBindGroupLayouts(device);
    const pipelines = this.createPipelines(device, bindGroupLayouts);
    // Render passes are given attachments to write into.
    const renderPassColorAttachment: GPURenderPassColorAttachment = { view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" };
    const renderPassDescriptor = { colorAttachments: [renderPassColorAttachment] };
    // Create uniform buffer for shader uniforms, calculate uniform buffer size
    const uniformFloatBuffer: GPUBuffer = device.createBuffer({ size: 128 + 4 * 4 * 3, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const uniformUintBuffer: GPUBuffer = device.createBuffer({ size: 128 + 4 * 4 * 3, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Link GPUBufferManagers to BufferManagers
    const gpuManagers: PathTracerGPUBufferManagers = {
      // Prototype GPU Managers
      triangleGPUManager: new BufferToRGBA16<Float16Array>(Prototype.triangleManager, device, "float", "triangle buffer"),
      BVHGPUManager: new BufferToRGBA32<Uint32Array>(Prototype.BVHManager, device, "uint", "bvh buffer"),
      boundingVertexGPUManager: new BufferToRGBA16<Float16Array>(Prototype.boundingVertexManager, device, "float", "bounding vertex buffer"),
      // Texture GPU Managers
      textureInstanceGPUManager: new BufferToGPUBuffer<Uint32Array>(Texture.textureInstanceBufferManager, device, "texture instance buffer"),
      textureDataGPUManager: new BufferToRGBA8<Uint8Array>(Texture.textureDataBufferManager, device, "uint", "texture data buffer"),
      // Environment Map GPU Manager
      environmentMapGPUManager: new EnvironmentMapWebGPU(device, this.scene, "environment map"),
      // Scene GPU Managers
      instanceUintGPUManager: new BufferToGPUBuffer<Uint32Array>(this.scene.instanceUintManager, device, "instance uint buffer"),
      instanceTransformGPUManager: new BufferToGPUBuffer<Float32Array>(this.scene.instanceTransformManager, device, "instance transform buffer"),
      instanceMaterialGPUManager: new BufferToGPUBuffer<Float32Array>(this.scene.instanceMaterialManager, device, "instance material buffer"),

      instanceBVHGPUManager: new BufferToGPUBuffer<Uint32Array>(this.scene.instanceBVHManager, device, "instance bvh buffer"),
      instanceBoundingVertexGPUManager: new BufferToGPUBuffer<Float32Array>(this.scene.instanceBoundingVertexManager, device, "instance bounding vertex buffer"),
      pointLightGPUManager: new BufferToGPUBuffer<Float32Array>(this.scene.pointLightManager, device, "point light buffer"),
    }
    // Init canvas parameters and textures with resize
    this.resize(device);
    // this.#renderFrame();
    this.resizeHook = () => this.resize(device);
    window.addEventListener("resize", this.resizeHook);
    // Begin frame cycle
    requestAnimationFrame(() => this.frameCycle(device, context, bindGroupLayouts, pipelines, renderPassDescriptor, uniformFloatBuffer, uniformUintBuffer, gpuManagers));
  }

  // Internal render engine Functions
  private frameCycle (
    device: GPUDevice, context: GPUCanvasContext,
    bindGroupLayouts: PathTracerBindGroupLayouts, pipelines: PathTracerPipelines,
    renderPassDescriptor: GPURenderPassDescriptor, uniformFloatBuffer: GPUBuffer, uniformUintBuffer: GPUBuffer,
    gpuManagers: PathTracerGPUBufferManagers
  ) {
    if (!this.isRunning) return;
    // Check if recompile is required
    if (this.engineState.temporal !== this.config.temporal || this.engineState.temporalSamples !== this.config.temporalSamples || this.engineState.renderQuality !== this.config.renderQuality) {
      // Unbind GPUBuffers
      Prototype.triangleManager.releaseGPUBuffer();
      Prototype.BVHManager.releaseGPUBuffer();
      Prototype.boundingVertexManager.releaseGPUBuffer();
      Texture.textureInstanceBufferManager.releaseGPUBuffer();
      Texture.textureDataBufferManager.releaseGPUBuffer();
      this.scene.instanceUintManager.releaseGPUBuffer();
      this.scene.instanceTransformManager.releaseGPUBuffer();
      this.scene.instanceMaterialManager.releaseGPUBuffer();
      this.scene.instanceBVHManager.releaseGPUBuffer();
      this.scene.instanceBoundingVertexManager.releaseGPUBuffer();
      this.scene.pointLightManager.releaseGPUBuffer();

      console.log("RECOMPILE");
      // Update Textures
      requestAnimationFrame(() => this.prepareEngine(device, context));
      return;
    }
    // Request browser to render frame with hardware acceleration
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.frameCycle(device, context, bindGroupLayouts, pipelines, renderPassDescriptor, uniformFloatBuffer, uniformUintBuffer, gpuManagers);
      }, 1000 / this.fpsLimit);
    });
    
    // Swap antialiasing program if needed
    if (this.engineState.antialiasing !== this.config.antialiasing) {
      // Use internal antialiasing variable for actual state of antialiasing.
      this.engineState.antialiasing = this.config.antialiasing;
      switch (this.config.antialiasing) {
        case "fxaa":
          this.antialiasingModule = new FXAA(device, this.canvas);
          break;
        case "taa":
          this.antialiasingModule = new TAA(device, this.canvas);
          break;
        default:
          this.antialiasingModule = undefined;
      }
    }
    // Render new Image, work through queue
    this.renderFrame(
      device, context,
      bindGroupLayouts, pipelines,
      renderPassDescriptor, uniformFloatBuffer, uniformUintBuffer,
      gpuManagers
    );
    // Update frame counter
    this.updatePerformanceMetrics();
  }

  async renderFrame (
    device: GPUDevice, context: GPUCanvasContext,
    bindGroupLayouts: PathTracerBindGroupLayouts, pipelines: PathTracerPipelines,
    renderPassDescriptor: GPURenderPassDescriptor, uniformFloatBuffer: GPUBuffer, uniformUintBuffer: GPUBuffer,
    gpuBufferManagers: PathTracerGPUBufferManagers
  ) {
    // Immediately return if no canvas size dependent resources aren't available
    if (!this.canvasSizeDependentResources) return;
    // Calculate jitter for temporal antialiasing
    let jitter = { x: 0, y: 0 };
    if (this.antialiasingModule instanceof TAA) jitter = this.antialiasingModule.jitter();
    // Calculate projection matrix
    // let dir = { x: this.camera.direction.x, y: this.camera.direction.y };
    let dirJitter = { x: this.camera.direction.x + jitter.x, y: this.camera.direction.y + jitter.y };
    let canvasTarget = context.getCurrentTexture();
    // Assemble lists to fill bind groups
    let computeTargetView =
      this.config.temporal ? this.canvasSizeDependentResources!.temporalIn!.createView({ dimension: "2d-array", arrayLayerCount: 2 }) :
      !this.antialiasingModule ? this.canvasSizeDependentResources!.canvasIn!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) :
      this.antialiasingModule.textureInView2dArray;

    if (!computeTargetView) throw new Error("Could not create compute target view.");

    // Fill render binding groups
    const depthGroup = device.createBindGroup({
      label: "depth buffer for depth testing raster pass",
      layout: bindGroupLayouts.depthGroupLayout,
      entries: [ { binding: 0, resource: { buffer: this.canvasSizeDependentResources!.depthBuffer }} ]
    });

    const rasterRenderGroup = device.createBindGroup({
      label: "render output group for raster pass",
      layout: bindGroupLayouts.rasterRenderGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.canvasSizeDependentResources!.depthBuffer }},
        { binding: 1, resource: { buffer: this.canvasSizeDependentResources!.offsetBuffer } },
        { binding: 2, resource: this.canvasSizeDependentResources!.absolutePositionTexture.createView() },
        { binding: 3, resource: this.canvasSizeDependentResources!.uvTexture.createView() }
      ]
    });



    // const computeShiftView = this.config.temporal ? this.canvasSizeDependentResources!.temporalIn!.createView({ dimension: "2d-array", arrayLayerCount: 5 }) : ;
    
    const computeRenderGroup = device.createBindGroup({
      label: "render input group for compute pass",
      layout: bindGroupLayouts.computeRenderGroupLayout,
      entries: [
        { binding: 0, resource: computeTargetView },
        { binding: 1, resource: { buffer: this.canvasSizeDependentResources!.offsetBuffer } },
        { binding: 2, resource: this.canvasSizeDependentResources!.absolutePositionTexture.createView() },
        { binding: 3, resource: this.canvasSizeDependentResources!.uvTexture.createView() },
        { binding: 4, resource: this.canvasSizeDependentResources!.shiftTargetFloat!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) },
        { binding: 5, resource: this.canvasSizeDependentResources!.shiftTargetUint!.createView({ dimension: "2d-array", arrayLayerCount: this.config.temporal ? 4 : 1 }) },
      ]
    });
    

    let shiftGroup: GPUBindGroup | undefined;
    let selectiveAverageGroup: GPUBindGroup | undefined;
    // let reprojectGroup: GPUBindGroup | undefined;
    let temporalDynamicGroup: GPUBindGroup | undefined;
    
    if (this.config.temporal) {
      let temporalTargetView = this.antialiasingModule ? this.antialiasingModule.textureInView : this.canvasSizeDependentResources!.canvasIn.createView({ dimension: "2d" });
      // console.log(temporalTargetView);
      if (!temporalTargetView) throw new Error("Could not create temporal target view.");
      // Create shift group with array views
      shiftGroup = device.createBindGroup({ 
        label: "bind group for motion correction pass", layout: bindGroupLayouts.shiftGroupLayout!, 
        entries: [
          { binding: 0, resource: this.canvasSizeDependentResources!.accumulatedTargetFloat!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) },
          { binding: 1, resource: this.canvasSizeDependentResources!.accumulatedTargetUint!.createView({ dimension: "2d-array", arrayLayerCount: 4 }) },
          { binding: 2, resource: this.canvasSizeDependentResources!.shiftTargetFloat!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) },
          { binding: 3, resource: this.canvasSizeDependentResources!.shiftTargetUint!.createView({ dimension: "2d-array", arrayLayerCount: 4 }) },
          // { binding: 4, resource: { buffer: this.canvasSizeDependentResources!.depthBuffer } },
          { binding: 4, resource: this.canvasSizeDependentResources!.absolutePositionTexture.createView() },
          { binding: 5, resource: { buffer: this.canvasSizeDependentResources!.offsetBuffer } },
          { binding: 6, resource: { buffer: this.canvasSizeDependentResources!.shiftLock! } }
        ]
      });
      // Create selective average group with array views
      selectiveAverageGroup = device.createBindGroup({ 
        label: "bind group accumulation pass", layout: bindGroupLayouts.selectiveAverageGroupLayout!, 
        entries: [
          { binding: 0, resource: this.canvasSizeDependentResources!.temporalIn!.createView({ dimension: "2d-array", arrayLayerCount: 2 }) },
          { binding: 1, resource: this.canvasSizeDependentResources!.shiftTargetFloat!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) },
          { binding: 2, resource: this.canvasSizeDependentResources!.shiftTargetUint!.createView({ dimension: "2d-array", arrayLayerCount: 4 }) },
          { binding: 3, resource: this.canvasSizeDependentResources!.accumulatedTargetFloat!.createView({ dimension: "2d-array", arrayLayerCount: 1 }) },
          { binding: 4, resource: this.canvasSizeDependentResources!.accumulatedTargetUint!.createView({ dimension: "2d-array", arrayLayerCount: 4 }) },
          { binding: 5, resource: temporalTargetView }
        ] 
      });

      temporalDynamicGroup = device.createBindGroup({
        label: "dynamic binding group for temporal pass", layout: bindGroupLayouts.temporalDynamicGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: uniformFloatBuffer } },
          { binding: 1, resource: { buffer: uniformUintBuffer } },
          { binding: 2, resource: { buffer: gpuBufferManagers.instanceTransformGPUManager.gpuResource } }
        ]
      });
    }

    if (this.antialiasingModule) this.antialiasingModule.createBindGroup(this.canvasSizeDependentResources!.canvasIn);
    
    const canvasGroup = device.createBindGroup({
      label: "render input group for canvas pass", layout: bindGroupLayouts.canvasGroupLayout!,
      entries: [
        { binding: 0, resource: this.canvasSizeDependentResources!.canvasIn.createView({ dimension: "2d" }) },
        { binding: 1, resource: canvasTarget.createView() }
      ]
    });

    // Update scene buffers on CPU and sync to GPU
    const totalTriangleCount: number = this.scene.updateBuffers();

    // Create buffer groups with static buffers
    const rasterGeometryGroup = device.createBindGroup({
      label: "bind group for raster geometry pass",
      layout: bindGroupLayouts.rasterGeometryGroupLayout,
      entries: [
        { binding: 0, resource: gpuBufferManagers.triangleGPUManager.gpuResource }
      ]
    });

    
    const computeGeometryGroup = device.createBindGroup({
      label: "bind group for compute geometry pass",
      layout: bindGroupLayouts.computeGeometryGroupLayout,
      entries: [
        { binding: 0, resource: gpuBufferManagers.triangleGPUManager.gpuResource },
        { binding: 1, resource: gpuBufferManagers.BVHGPUManager.gpuResource },
        { binding: 2, resource: gpuBufferManagers.boundingVertexGPUManager.gpuResource }
      ]
    });

    const computeTextureGroup = device.createBindGroup({
      label: "bind group for compute texture pass",
      layout: bindGroupLayouts.computeTextureGroupLayout,
      entries: [
        { binding: 0, resource: gpuBufferManagers.textureDataGPUManager.gpuResource },
        { binding: 1, resource: { buffer: gpuBufferManagers.textureInstanceGPUManager.gpuResource } },
        { binding: 2, resource: gpuBufferManagers.environmentMapGPUManager.gpuResource },
        { binding: 3, resource: gpuBufferManagers.environmentMapGPUManager.gpuSampler }
      ]
    });

    
    // Set render target for canvas
    const colorAttachments = renderPassDescriptor.colorAttachments;
    for (const attachment of colorAttachments) if (attachment) attachment.view = canvasTarget.createView();
    // Calculate camera offset and projection matrix
    let invFov = 1 / this.camera.fov;
    let heightInvWidthFov = this.canvas.height * invFov / this.canvas.width;
    let viewMatrix = new Matrix<3, 3>(
      [   Math.cos(dirJitter.x) * heightInvWidthFov,                  0,                                Math.sin(dirJitter.x) * heightInvWidthFov               ],
      [ - Math.sin(dirJitter.x) * Math.sin(dirJitter.y) * invFov,     Math.cos(dirJitter.y) * invFov,   Math.cos(dirJitter.x) * Math.sin(dirJitter.y) * invFov  ],
      [ - Math.sin(dirJitter.x) * Math.cos(dirJitter.y),            - Math.sin(dirJitter.y),            Math.cos(dirJitter.x) * Math.cos(dirJitter.y)           ]
    );

    let invViewMatrix = moore_penrose(viewMatrix);
    
    // if (!this.config.temporal) viewMatrix = viewMatrixJitter;
    const temporalCount = this.config.temporal ? this.frameCounter : 0;
    // Update uniform values on GPU
    if (uniformFloatBuffer) device.queue.writeBuffer(uniformFloatBuffer, 0, new Float32Array([
      // View matrix
      viewMatrix[0]![0]!, viewMatrix[1]![0]!, viewMatrix[2]![0]!, 0,
      viewMatrix[0]![1]!, viewMatrix[1]![1]!, viewMatrix[2]![1]!, 0,
      viewMatrix[0]![2]!, viewMatrix[1]![2]!, viewMatrix[2]![2]!, 0,
      // View matrix inverse
      invViewMatrix[0]![0]!, invViewMatrix[1]![0]!, invViewMatrix[2]![0]!, 0,
      invViewMatrix[0]![1]!, invViewMatrix[1]![1]!, invViewMatrix[2]![1]!, 0,
      invViewMatrix[0]![2]!, invViewMatrix[1]![2]!, invViewMatrix[2]![2]!, 0,
      // Camera
      this.camera.position.x, this.camera.position.y, this.camera.position.z, 0,
      // Ambient light
      this.scene.ambientLight.x, this.scene.ambientLight.y, this.scene.ambientLight.z, 0,
      // min importancy of light ray
      this.config.minImportancy,
      
      // Instance count
      // sceneNumbers.instanceCount,
      // Triangle count
      // sceneNumbers.triangleCount,
    ]));

    let firstEnvMapSide: HTMLImageElement | undefined = this.scene.environmentMap.cubeSideImages[0];
    let envMapSize: Vector<2> = new Vector(firstEnvMapSide ? firstEnvMapSide.width : 1, firstEnvMapSide ? firstEnvMapSide.height : 1);

    if (uniformUintBuffer) device.queue.writeBuffer(uniformUintBuffer, 0, new Uint32Array([
      // Render size
      this.canvas.width, this.canvas.height,
      // Temporal target
      temporalCount,
      // Temporal max
      TEMPORAL_MAX,
      // render for temporal or not
      (this.config.temporal ? 1 : 0),
      // amount of samples per ray
      this.config.samplesPerRay,
      // max reflections of ray
      this.config.maxReflections,
      // Tonemapping operator
      (this.config.hdr ? 1 : 0),
      // Environment map size
      envMapSize.x, envMapSize.y,
    ]));

    // Create buffer groups with dynamic buffers
    const rasterDynamicGroup = device.createBindGroup({
      label: "dynamic binding group for raster pass",
      layout: bindGroupLayouts.rasterDynamicGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformFloatBuffer } },
        { binding: 1, resource: { buffer: uniformUintBuffer } },
        { binding: 2, resource: { buffer: gpuBufferManagers.instanceUintGPUManager.gpuResource } },
        { binding: 3, resource: { buffer: gpuBufferManagers.instanceTransformGPUManager.gpuResource } }
      ],
    });

    const computeDynamicGroup = device.createBindGroup({
      label: "dynamic binding group for compute pass",
      layout: bindGroupLayouts.computeDynamicGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformFloatBuffer } },
        { binding: 1, resource: { buffer: uniformUintBuffer } },
        { binding: 2, resource: { buffer: gpuBufferManagers.pointLightGPUManager.gpuResource } },

        { binding: 3, resource: { buffer: gpuBufferManagers.instanceUintGPUManager.gpuResource } },
        { binding: 4, resource: { buffer: gpuBufferManagers.instanceTransformGPUManager.gpuResource } },
        { binding: 5, resource: { buffer: gpuBufferManagers.instanceMaterialGPUManager.gpuResource } },

        { binding: 6, resource: { buffer: gpuBufferManagers.instanceBVHGPUManager.gpuResource } },
        { binding: 7, resource: { buffer: gpuBufferManagers.instanceBoundingVertexGPUManager.gpuResource } },
      ],
    });

    const postDynamicGroup = device.createBindGroup({
      label: "dynamic binding group for post processing passes",
      layout: bindGroupLayouts.postDynamicGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformFloatBuffer } },
        { binding: 1, resource: { buffer: uniformUintBuffer } }
      ]
    });

    const clusterDims: Vector<2> = new Vector(Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8));

    // Command encoders record commands for the GPU to execute.
    let commandEncoder = device.createCommandEncoder();

    commandEncoder.clearBuffer(this.canvasSizeDependentResources.depthBuffer);
    commandEncoder.clearBuffer(this.canvasSizeDependentResources.offsetBuffer);
    // if (this.canvasSizeDependentResources.shiftLock) commandEncoder.clearBuffer(this.canvasSizeDependentResources.shiftLock);

    // All rendering commands happen in a render pass
    let depthEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    // Set the pipeline to use when drawing
    depthEncoder.setPipeline(pipelines.depthPipeline);
    // Set storage buffers for rester pass
    depthEncoder.setBindGroup(0, depthGroup);
    depthEncoder.setBindGroup(1, rasterGeometryGroup);
    depthEncoder.setBindGroup(2, rasterDynamicGroup);
    // Draw vertices using the previously set pipeline
    depthEncoder.draw(3, totalTriangleCount);
    // End the render pass
    depthEncoder.end();

    
    // All rendering commands happen in a render pass
    let renderEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    // Set the pipeline to use when drawing
    renderEncoder.setPipeline(pipelines.rasterPipeline);
    // Set storage buffers for rester pass
    renderEncoder.setBindGroup(0, rasterRenderGroup);
    renderEncoder.setBindGroup(1, rasterGeometryGroup);
    renderEncoder.setBindGroup(2, rasterDynamicGroup);
    // Draw vertices using the previously set pipeline
    renderEncoder.draw(3, totalTriangleCount);
    // End the render pass
    renderEncoder.end();


    if (this.config.temporal) {
      let shiftEncoder = commandEncoder.beginComputePass();
      // Set the storage buffers and textures for compute pass
      shiftEncoder.setPipeline(pipelines.shiftPipeline!);
      shiftEncoder.setBindGroup(0, shiftGroup);
      shiftEncoder.setBindGroup(1, temporalDynamicGroup);
      shiftEncoder.dispatchWorkgroups(clusterDims.x, clusterDims.y);
      // End motion correction pass
      shiftEncoder.end();
    }
    

    let computeClusterDims: Vector<2> = new Vector(Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8));
    
    // Run compute shader
    let computeEncoder = commandEncoder.beginComputePass();
    // Set the storage buffers and textures for compute pass
    computeEncoder.setPipeline(pipelines.computePipeline);
    computeEncoder.setBindGroup(0, computeRenderGroup);
    computeEncoder.setBindGroup(1, computeTextureGroup);
    computeEncoder.setBindGroup(2, computeGeometryGroup);
    computeEncoder.setBindGroup(3, computeDynamicGroup);
    computeEncoder.dispatchWorkgroups(computeClusterDims.x, computeClusterDims.y);
    // End compute pass
    computeEncoder.end();

    // Execute temporal pass if activated
    if (this.config.temporal) {
      let selectiveAverageEncoder = commandEncoder.beginComputePass();
      // Set the storage buffers and textures for compute pass
      selectiveAverageEncoder.setPipeline(pipelines.selectiveAveragePipeline!);
      selectiveAverageEncoder.setBindGroup(0, selectiveAverageGroup);
      selectiveAverageEncoder.setBindGroup(1, temporalDynamicGroup);
      selectiveAverageEncoder.dispatchWorkgroups(clusterDims.x, clusterDims.y);

      selectiveAverageEncoder.end();

      /*

      let reprojectEncoder = commandEncoder.beginComputePass();
      // Set the storage buffers and textures for compute pass
      reprojectEncoder.setPipeline(pipelines.reprojectPipeline!);
      reprojectEncoder.setBindGroup(0, reprojectGroup);
      reprojectEncoder.setBindGroup(1, temporalDynamicGroup);
      reprojectEncoder.dispatchWorkgroups(clusterDims.x, clusterDims.y);
      // End reproject pass
      reprojectEncoder.end();
      */
    }
    
    if (this.antialiasingModule) {
      this.antialiasingModule.renderFrame(commandEncoder);
    }

    
    let canvasEncoder = commandEncoder.beginComputePass();
    // Set the storage buffers and textures for compute pass
    canvasEncoder.setPipeline(pipelines.canvasPipeline);
    canvasEncoder.setBindGroup(0, canvasGroup);
    canvasEncoder.setBindGroup(1, postDynamicGroup);
    canvasEncoder.dispatchWorkgroups(clusterDims.x, clusterDims.y);
    // End compute pass
    canvasEncoder.end();
    
    
    // Finish recording commands, which creates a command buffer.
    let commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

  }
}
