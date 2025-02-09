"use strict";

import { Vector } from "../common/lib/math";
import { Scene } from "../common/scene/scene";
import { Texture } from "../common/scene/texture";



export class EnvironmentMapWebGPU {
    private gpuTextureSize: Vector<3>;
    private _gpuTexture: GPUTexture;
    get gpuResource() { return this._gpuTexture.createView({ dimension: "cube" }); }

    private _gpuSampler: GPUSampler;
    get gpuSampler() { return this._gpuSampler; }
    
    private device: GPUDevice;
    // private environmentMapTexture: GPUTexture;
    private scene: Scene;
    private label: string;

    constructor(device: GPUDevice, scene: Scene, label: string = "") {
        // Save device for future use
        this.device = device;
        this.scene = scene;
        // Keep label for reference
        this.label = label;
        // Get size of first cube side image
        const source = this.scene.environmentMap.cubeSideImages[0];
        this.gpuTextureSize = new Vector(source ? source.width : 1, source ? source.height : 1, 6);
        // Initialize GPUTexture
        this._gpuTexture = device.createTexture({
          //format: 'rgba32float',
          format: 'rgba8unorm',
          size: this.gpuTextureSize,
          usage: GPUTextureUsage.TEXTURE_BINDING |
                 GPUTextureUsage.COPY_DST |
                 GPUTextureUsage.RENDER_ATTACHMENT,
        });
        // Create sampler
        this._gpuSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

        if (source) {
            console.log("EnvironmentMapWebGPU.constructor(): source is not null", source);
            // Copy image data to GPUTexture
            this.copySourcesToCubeMap(device, this.scene.environmentMap.cubeSideImages);
        }
    }

    private async copySourcesToCubeMap(device: GPUDevice, sources: Array<HTMLImageElement>) {

        let promises = Array<Promise<HTMLCanvasElement>>();
        sources.forEach((source, layer) => {
            promises[layer] = Texture.getTextureData(source, 4, Math.max(source.width, 1), Math.max(source.height, 1));
        });

        sources.forEach(async (source, layer) => {
            // Convert image to GPUCanvasContext
            const canvas = await promises[layer];
            
            device.queue.copyExternalImageToTexture(
                { source: canvas!, flipY: false },
                { texture: this._gpuTexture, origin: [0, 0, layer] },
                { width: source.width, height: source.height },
            );
        });
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        // Get size of first cube side image
        const source = this.scene.environmentMap.cubeSideImages[0];
        this.gpuTextureSize = new Vector(source ? source.width : 1, source ? source.height : 1, 6);

        this._gpuTexture = this.device.createTexture({
          format: 'rgba32float',
          size: this.gpuTextureSize,
          usage: GPUTextureUsage.TEXTURE_BINDING |
                 GPUTextureUsage.COPY_DST |
                 GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.copySourcesToCubeMap(this.device, this.scene.environmentMap.cubeSideImages);
    }

    destroy = () => {
        // Destroy GPUTexture
        this._gpuTexture.destroy();
    }
}

