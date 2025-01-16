"use strict";

import { Constructor } from "../common/buffer/typed-array-view";
import { BufferToGPU } from "../common/buffer/buffer-to-gpu";
import { BufferManager } from "../common/buffer/buffer-manager";
import { Vector } from "../common/lib/math";


const TEXTURE_SIZE_2D: Vector<2> = new Vector(2048, 2048);

export class BufferToRGBA8Uint extends BufferToGPU {
    protected bufferManager: BufferManager<Uint8Array>;

    private gpuTextureSize: Vector<3>;
    private _gpuTexture: GPUTexture;
    get gpuResource() { return this._gpuTexture.createView({ dimension: "2d-array", arrayLayerCount: this.gpuTextureSize.z }); }
    
    private device: GPUDevice;
    private label: string;

    constructor(bufferManager: BufferManager<Uint8Array>, device: GPUDevice, label: string = "") {
        super();
        // Save device for future use
        this.device = device;
        // Save buffer manager for future use
        this.bufferManager = bufferManager;
        // Save label for reference
        this.label = label;
        // Bind GPUBuffer to BufferManager
        bufferManager.bindGPUBuffer(this);

        // Update gpuTextureSize
        this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
        console.log(this.gpuTextureSize + "");
        // Create GPUBuffer
        this._gpuTexture = this.device.createTexture({
            // dimension: "3d",
            size: this.gpuTextureSize,
            format: "rgba8uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
        });

        const bytesPerRow = this.gpuTextureSize.x * 4;
        const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
        const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
        const fullView = new Uint8Array(arrayBuffer, 0, arrayBuffer.byteLength);

        console.log("RGBA8UINT bytesPerLayer", bytesPerLayer);

        fullView.set(this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        device.queue.writeTexture(
            { texture: this._gpuTexture, aspect: "all" },
            fullView, { bytesPerRow },
            { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
        );
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        console.log("RECONSTRUCT UINT8");
        // Only reconstruct if gpuTexture needs to be recreated
        if (4 * this.gpuTextureSize.x * this.gpuTextureSize.y * this.gpuTextureSize.z < this.bufferManager.length) {
            // Destroy old GPUTexture
            this._gpuTexture.destroy();
            // Update gpuTextureSize
            this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
            // Rereate GPUTexture
            this._gpuTexture = this.device.createTexture({
                // dimension: "3d",
                size: this.gpuTextureSize,
                format: "rgba8uint",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
            });

            const bytesPerRow = 4 * this.gpuTextureSize.x;
            const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
            const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
            const fullView = new Uint8Array(arrayBuffer, 0, arrayBuffer.byteLength);
    
            fullView.set(this.bufferManager.bufferView);
            // Copy data from buffer manager to GPUBuffer
            this.device.queue.writeTexture(
                { texture: this._gpuTexture, aspect: "all" },
                fullView, { bytesPerRow },
                { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
            );
        }
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {
        console.log("UPDATE UINT8");
        const firstAffectedLayer = Math.floor(byteOffset / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * 4));
        const firstAffectedLayerByteOffset = firstAffectedLayer * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * 4;
        const lastAffectedLayer = Math.floor((byteOffset + length) / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * 4));
        const layerLength = lastAffectedLayer - firstAffectedLayer + 1;

        this.device.queue.writeTexture(
            { texture: this._gpuTexture, origin: { x: 0, y: 0, z: firstAffectedLayer }},
            this.bufferManager.bufferView, 
            { offset: firstAffectedLayerByteOffset },
            { width: TEXTURE_SIZE_2D.x, height: TEXTURE_SIZE_2D.y, depthOrArrayLayers: layerLength }
        );
    }

    destroy = () => {
        // Destroy GPUBuffer
        this._gpuTexture.destroy();
        // Release GPUBuffer from BufferManager
        this.bufferManager.releaseGPUBuffer();
    }
}