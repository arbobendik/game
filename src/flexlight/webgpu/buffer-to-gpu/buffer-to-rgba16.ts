"use strict";

import { BufferToGPU } from "../../common/buffer/buffer-to-gpu";
import { BufferManager } from "../../common/buffer/buffer-manager";
import { Vector } from "../../common/lib/math";
import { Float16Array } from "../../common/buffer/float-16-array";


export type TypedArrayR16 = Float16Array | Uint16Array | Int16Array;
export type TypedArrayR16Type = "float" | "uint" | "sint";
const TEXTURE_SIZE_2D: Vector<2> = new Vector(2048, 2048);


export class BufferToRGBA16<T extends TypedArrayR16> extends BufferToGPU {
    protected bufferManager: BufferManager<T>;
    
    readonly BYTES_PER_ELEMENT: number = 2;
    private gpuTextureSize: Vector<3>;
    private _gpuTexture: GPUTexture;
    get gpuResource() { return this._gpuTexture.createView({ dimension: "2d-array", arrayLayerCount: this.gpuTextureSize.z }); }
    
    private device: GPUDevice;
    private type: TypedArrayR16Type;
    private label: string;

    constructor(bufferManager: BufferManager<T>, device: GPUDevice, type: TypedArrayR16Type = "float", label: string = "") {
        super();
        // Save device for future use
        this.device = device;
        // Save buffer manager for future use
        this.bufferManager = bufferManager;
        // Save type
        this.type = type;
        // Save label for reference
        this.label = label;
        // Bind GPUBuffer to BufferManager
        bufferManager.bindGPUBuffer(this);

        // Update gpuTextureSize
        this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(bufferManager.length / (4 * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
        // Create GPUBuffer
        // console.log(label, "r32" + type);
        this._gpuTexture = this.device.createTexture({
            // dimension: "3d",
            size: this.gpuTextureSize,
            format: ("rgba16" + type) as GPUTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
            label: label
        });

        const bytesPerRow = 4 * this.gpuTextureSize.x * this.BYTES_PER_ELEMENT;
        const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
        const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
        const fullView = new this.bufferManager.viewConstructor(arrayBuffer, 0, arrayBuffer.byteLength / this.BYTES_PER_ELEMENT);

        fullView.set(this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        device.queue.writeTexture(
            { texture: this._gpuTexture, aspect: "all" },
            fullView, { bytesPerRow, rowsPerImage: this.gpuTextureSize.y },
            { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
        );
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        // Only reconstruct if gpuTexture needs to be recreated
        if (4 * this.gpuTextureSize.x * this.gpuTextureSize.y * this.gpuTextureSize.z <= this.bufferManager.length) {
            // Destroy old GPUTexture
            this._gpuTexture.destroy();
            // Update gpuTextureSize
            this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(this.bufferManager.length / (4 * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
            // Rereate GPUTexture
            this._gpuTexture = this.device.createTexture({
                // dimension: "3d",
                size: this.gpuTextureSize,
                format: ("rgba16" + this.type) as GPUTextureFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
                label: this.label
            });

        }

        const bytesPerRow = 4 * this.gpuTextureSize.x * this.BYTES_PER_ELEMENT;
        const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
        const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
        const fullView = new this.bufferManager.viewConstructor(arrayBuffer, 0, arrayBuffer.byteLength / this.BYTES_PER_ELEMENT);
        
        fullView.set(this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        this.device.queue.writeTexture(
            { texture: this._gpuTexture, aspect: "all" },
            fullView, { bytesPerRow, rowsPerImage: this.gpuTextureSize.y },
            { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
        );
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {

        const firstAffectedLayer = Math.floor(byteOffset / (4 * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT));
        const firstAffectedLayerByteOffset = firstAffectedLayer * 4 * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT;
        const lastAffectedLayer = Math.floor((byteOffset + length) / (4 * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT));
        const layerLength = lastAffectedLayer - firstAffectedLayer + 1;
        // Copy data from buffer manager to GPUBuffer
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