"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Vector } from "../lib/math";


export class Material {
    color: Vector<3>;
    emissive: Vector<3>;
    roughness: number;
    metallic: number;
    transmission: number;
    ior: number;

    constructor(color: Vector<3> = new Vector(1, 1, 1), emissive: Vector<3> = new Vector(0, 0, 0), roughness: number = 0.5, metallic: number = 0, transmission: number = 0, ior: number = 1.5) {
        this.color = color;
        this.emissive = emissive;
        this.roughness = roughness;
        this.metallic = metallic;
        this.transmission = transmission;
        this.ior = ior;
    }
}

export class InstanceMaterial implements Material {
    // ColorR, ColorG, ColorB, EmissiveR, EmissiveG, EmissiveB, Roughness, Metallic, Transmission, IOR
    private readonly _materialFloatManager: BufferManager<Float32Array>;
    readonly materialArray: TypedArrayView<Float32Array>;

    constructor(materialFloatManager: BufferManager<Float32Array>, material: Material) {
        this._materialFloatManager = materialFloatManager;
        this.materialArray = this._materialFloatManager.allocateArray([
            // Color
            material.color.x, material.color.y, material.color.z, 0,

            // Emissive
            material.emissive.x, material.emissive.y, material.emissive.z,
            // Roughness
            material.roughness,

            // Metallic
            material.metallic,
            // Transmission
            material.transmission,
            // IOR
            material.ior, 0
        ]);
    }

    destroy(): void {
        this._materialFloatManager.freeArray(this.materialArray);
    }

    set color(color: Vector<3>) {
        this.materialArray[0] = color.x;
        this.materialArray[1] = color.y;
        this.materialArray[2] = color.z;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset, 3);
    }

    get color(): Vector<3> {
        return new Vector<3>(this.materialArray[0] ?? 255, this.materialArray[1] ?? 255, this.materialArray[2] ?? 255);
    }

    set emissive(emissive: Vector<3>) {
        this.materialArray[4] = emissive.x;
        this.materialArray[5] = emissive.y;
        this.materialArray[6] = emissive.z;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 4 * this.materialArray.BYTES_PER_ELEMENT, 3);
    }

    get emissive(): Vector<3> {
        return new Vector<3>(this.materialArray[4] ?? 0, this.materialArray[5] ?? 0, this.materialArray[6] ?? 0);
    }

    set roughness(roughness: number) {
        this.materialArray[7] = roughness;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 7 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get roughness(): number {
        return this.materialArray[7] ?? 0.5;
    }

    set metallic(metallic: number) {
        this.materialArray[8] = metallic;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 8 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get metallic(): number {
        return this.materialArray[8] ?? 0;
    }

    set transmission(transmission: number) {
        this.materialArray[9] = transmission;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 9 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get transmission(): number {
        return this.materialArray[9] ?? 0;
    }

    set ior(ior: number) {
        this.materialArray[10] = ior;
        // Update gpu buffer if it exists
        this._materialFloatManager.gpuBufferManager?.update(this.materialArray.byteOffset + 10 * this.materialArray.BYTES_PER_ELEMENT, 1);
    }

    get ior(): number {
        return this.materialArray[10] ?? 1.5;
    }
}