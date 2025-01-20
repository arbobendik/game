"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Vector } from "../lib/math";


export class Material {
    // ColorR, ColorG, ColorB, EmissiveR, EmissiveG, EmissiveB, Roughness, Metallic, Transmission, IOR
    // private static _materialManager = new BufferManager(Float32Array);
    // static get materialManager() { return this._materialManager; }
    private readonly _instanceFloatManager;

    // static readonly DEFAULT_MATERIAL: Material = new Material();
    readonly materialArray: TypedArrayView<Float32Array>;

    constructor(instanceFloatManager: BufferManager<Float32Array>) {
        this._instanceFloatManager = instanceFloatManager;
        this.materialArray = this._instanceFloatManager.allocateArray([1, 1, 1, 0, 0, 0, 0.5, 0, 0, 1.5]);
        // console.log(this.materialArray);
    }

    destroy(): void {
        this._instanceFloatManager.freeArray(this.materialArray);
    }

    set color(color: Vector<3>) {
        this.materialArray[0] = color.x;
        this.materialArray[1] = color.y;
        this.materialArray[2] = color.z;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset, 3);
    }

    get color(): Vector<3> {
        return new Vector<3>(this.materialArray[0] ?? 255, this.materialArray[1] ?? 255, this.materialArray[2] ?? 255);
    }

    set emissive(emissive: Vector<3>) {
        this.materialArray[3] = emissive.x;
        this.materialArray[4] = emissive.y;
        this.materialArray[5] = emissive.z;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 3 * this.materialArray.BYTES_PER_ELEMENT, 3);
    }

    get emissive(): Vector<3> {
        return new Vector<3>(this.materialArray[3] ?? 0, this.materialArray[4] ?? 0, this.materialArray[5] ?? 0);
    }

    set roughness(roughness: number) {
        this.materialArray[6] = roughness;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 6 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get roughness(): number {
        return this.materialArray[6] ?? 0.5;
    }

    set metallic(metallic: number) {
        this.materialArray[7] = metallic;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 7 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get metallic(): number {
        return this.materialArray[7] ?? 0;
    }

    set transmission(transmission: number) {
        this.materialArray[8] = transmission;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 8 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get transmission(): number {
        return this.materialArray[8] ?? 0;
    }

    set ior(ior: number) {
        this.materialArray[9] = ior;
        // Update gpu buffer if it exists
        this._instanceFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 9 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get ior(): number {
        return this.materialArray[9] ?? 1.5;
    }
}