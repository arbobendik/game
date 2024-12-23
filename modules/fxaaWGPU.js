"use strict";

import { Network } from "./network.js";

export class FXAA {
    #shader = Network.fetchSync("shaders/pathtracer_fxaa.wgsl");
    #pipeline;
    #texture;
    #device;
    #canvas;
    #bindGroupLayout;
    #bindGroup;
    #uniformBuffer;

    constructor(device, canvas) {
        this.#device = device;
        this.#canvas = canvas;
        
        this.#bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: "float", sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
            ]
        });

        this.#uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Create initial texture
        this.createTexture();
    }

    get textureInView() {
        return this.#texture.createView({ dimension: "2d" });
    }

    get textureInView2d() {
        return this.#texture.createView({ dimension: "2d-array", arrayLayerCount: 1 });
    }

    createTexture = () => {
        // Free old texture buffers
        try {
            this.#texture.destroy();
        } catch {}
        // Create texture for FXAA input
        this.#texture = this.#device.createTexture({
            size: [this.#canvas.width, this.#canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | 
                   GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
        });
    };

    createBindGroup = (textureOut) => {
        this.#bindGroup = this.#device.createBindGroup({
            layout: this.#bindGroupLayout,
            entries: [
                { binding: 0, resource: this.#texture.createView() },
                { binding: 1, resource: textureOut.createView() },
                { binding: 2, resource: { buffer: this.#uniformBuffer }}
            ]
        });

        // Create pipeline
        this.#pipeline = this.#device.createComputePipeline({
            label: "fxaa pipeline",
            layout: this.#device.createPipelineLayout({ bindGroupLayouts: [ this.#bindGroupLayout ] }),
            compute: {
                module: this.#device.createShaderModule({ code: this.#shader }),
                entryPoint: "compute"
            }
        });


        const fxaaParams = new Float32Array([
            1.0 / 16.0,
            1.0 / 4.0,
            1.0 / 4.0
        ]);

        this.#device.queue.writeBuffer(this.#uniformBuffer, 0, fxaaParams);
    };

    renderFrame = (commandEncoder) => {
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.#pipeline);
        computePass.setBindGroup(0, this.#bindGroup);

        // Dispatch workgroups (32x32 threads per workgroup)
        const workgroupsX = Math.ceil(this.#canvas.width / 8);
        const workgroupsY = Math.ceil(this.#canvas.height / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();
    }
}
