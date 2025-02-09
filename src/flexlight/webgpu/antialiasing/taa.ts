'use strict';

import { Matrix, Vector, vector_scale } from '../../common/lib/math';
import { AntialiasingModule } from './antialiasing-module';
import { WebGPUAntialiasingType } from '../../../flexlight';
// @ts-ignore
import TAAShader from '../shaders/taa.wgsl';

const FRAMES: number = 4;
//const GOLDEN_RATIO: number = 2.236067977499790; // sqrt(5)

export class TAA extends AntialiasingModule {
    readonly type: WebGPUAntialiasingType = "taa";
    private pipeline: GPUComputePipeline;
    private texture: GPUTexture | undefined;
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private frameIndex: number = 0;

    private randomVecs: Matrix<typeof FRAMES, 2>;
    private bindGroupLayout: GPUBindGroupLayout;
    private bindGroup: GPUBindGroup | undefined;
    private uniformBuffer: GPUBuffer;

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        super();
        this.device = device;
        this.canvas = canvas;
        this.randomVecs = this.generateHaltonSequence(FRAMES);

        this.bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
            ]
        });

        this.pipeline = device.createComputePipeline({
            label: "taa pipeline",
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: {
                module: device.createShaderModule({ code: TAAShader }),
                entryPoint: "compute"
            }
        });

        this.uniformBuffer = device.createBuffer({
            size: 16, // frame_index, frames, random_vec.xy
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.createTexture();
    }

    get textureInView(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d", baseArrayLayer: this.frameIndex, arrayLayerCount: 1 });
    }

    get textureInView2dArray(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d-array", baseArrayLayer: this.frameIndex, arrayLayerCount: 1 });
    }

    createTexture = () => {
        this.texture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, FRAMES],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
        });
    };

    createBindGroup = (textureOut: GPUTexture) => {
        if (!this.texture) throw new Error("Texture not created. Attempting to create bind group.");

        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: this.texture.createView({ dimension: "2d-array", arrayLayerCount: FRAMES }) },
                { binding: 1, resource: textureOut.createView() },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });
    };

    renderFrame = (commandEncoder: GPUCommandEncoder) => {
        this.frameIndex = (this.frameIndex + 1) % FRAMES;
        const taaParams = new Float32Array([
            this.frameIndex,
            FRAMES,
            this.randomVecs[this.frameIndex]!.x,
            this.randomVecs[this.frameIndex]!.y
        ]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, taaParams);

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.pipeline);
        computePass.setBindGroup(0, this.bindGroup);

        const workgroupsX = Math.ceil(this.canvas.width / 8);
        const workgroupsY = Math.ceil(this.canvas.height / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();
    }

    jitter = (): Vector<2> => {
        let frameIndex = (this.frameIndex + 1) % FRAMES;
        let scale = 0.5 / Math.min(this.canvas.width, this.canvas.height);
        return vector_scale(this.randomVecs[frameIndex]!, scale);
    }

    private generateHaltonSequence(n: number): Matrix<typeof FRAMES, 2> {
        const vecs = new Matrix<typeof FRAMES, 2>({ matrix_height: n, matrix_width: 2 });
        
        for (let i = 0; i < n; i++) {
            vecs[i] = new Vector(
                this.halton(i, 2) - 0.5,  // Base 2 for x coordinate
                this.halton(i, 3) - 0.5   // Base 3 for y coordinate
            );
        }
        
        return vecs;
    }

    private halton(index: number, base: number): number {
        let result: number = 0;
        let f: number = 1;
        
        while (index > 0) {
            f = f / base;
            result = result + f * (index % base);
            index = Math.floor(index / base);
        }
        
        return result;
    }
}