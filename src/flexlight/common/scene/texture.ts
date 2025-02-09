"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";

type Channels = 1 | 2 | 3 | 4;

export class Texture {
    readonly texture: HTMLImageElement;
    readonly width: number;
    readonly height: number;

    // Save texture type properties
    private static instances: Set<Texture> = new Set();
    // Width, height, channels, dataOffset
    private static _textureInstanceBufferManager: BufferManager<Uint32Array> = new BufferManager(Uint32Array);
    static get textureInstanceBufferManager () { return Texture._textureInstanceBufferManager; }
    // Texture data buffer
    private static _textureDataBufferManager: BufferManager<Uint8Array> = new BufferManager(Uint8Array);
    static get textureDataBufferManager () { return Texture._textureDataBufferManager; }

    private textureDataBuffer: TypedArrayView<Uint8Array> | undefined;
    private _textureInstanceBuffer: TypedArrayView<Uint32Array> | undefined;
    get textureInstanceBuffer () { return this._textureInstanceBuffer; }

    private static _textureInstanceBufferCounter: number = 0;

    private _textureInstanceBufferId: number = 0;
    get textureInstanceBufferId () { return this._textureInstanceBufferId; }

    static async getTextureData(texture: HTMLImageElement, channels: Channels, width: number, height: number): Promise<HTMLCanvasElement> {
        // Create canvas, draw image and return bitmap
        const canvas = document.createElement("canvas");
        const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d"); 
        if (!ctx) throw new Error("Failed to get canvas context");
        canvas.width = width;
        canvas.height = height;
        console.log("Drawing texture", texture, width, height);
        // Disable image smoothing to get non-blury pixel values in given resolution
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(texture, 0, 0, width, height);
        // Return canvas context
        return canvas;
    }

    constructor (texture: HTMLImageElement, channels: Channels, width: number | undefined = undefined, height: number | undefined = undefined) {
        this.texture = texture;
        this.width = width ?? texture.width;
        this.height = height ?? texture.height;
        // Get texture data
        Texture.getTextureData(texture, channels, this.width, this.height).then((canvas: HTMLCanvasElement) => {
            const ctx = canvas.getContext("2d")!;
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            // Construct data array of pixel values
            const data = imageData.data;
            // Return as Uint8Array view.
            const array = new Uint8Array(data);

            this.textureDataBuffer = Texture.textureDataBufferManager.allocateArray(array);
            // console.log("Texture data buffer", this.textureDataBuffer);
            this._textureInstanceBuffer = Texture.textureInstanceBufferManager.allocateArray([this.textureDataBuffer.offset / 4, channels, this.width, this.height]);
        });

        this._textureInstanceBufferId = Texture._textureInstanceBufferCounter++;
        Texture.instances.add(this);
    }

    destroy() {
        // Remove texture instance from texture type instances
        Texture.instances.delete(this);
        // Substract length of this texture from all saved offsets of textures after this one
        for (let instance of Texture.instances) {
            if (instance.textureInstanceBuffer && this._textureInstanceBuffer && instance.textureInstanceBuffer.offset > this._textureInstanceBuffer.offset) {
                instance.textureInstanceBuffer[0]! -= this._textureInstanceBuffer.length;   
                // Decrement texture instance buffer id
                instance._textureInstanceBufferId--;
            }
        }
        // Decrement texture instance buffer counter by one
        Texture._textureInstanceBufferCounter--;
        // Free buffers if they exist
        if (this.textureDataBuffer) Texture.textureDataBufferManager.freeArray(this.textureDataBuffer);
        if (this._textureInstanceBuffer) Texture.textureInstanceBufferManager.freeArray(this._textureInstanceBuffer);
    }
}


export class NormalTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 3, width, height);
    }
}

export class AlbedoTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 3, width, height);
    }
}

export class EmissiveTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 3, width, height);
    }
}

export class RoughnessTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 1, width, height);
    }
}

export class MetallicTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 1, width, height);
    }
}

export class HeightTexture extends Texture {    
    constructor(texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        super(texture, 1, width, height);
    }
}