"use strict";

import { Parser } from "./obj-parser";
import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Bounding, BVHArrays } from "./bvh";
import { TriangleBVH } from "./triangle-bvh";
import { Material } from "./material";
import { Vector } from "../lib/math";
import { ObjectPrototype } from "./obj-parser";
import { Float16Array } from "../buffer/float-16-array";

export const TRIANGLE_SIZE = 24;

export class Prototype {
    // Buffer managers

    // Triangle data: V V V N N N UV UV UV
    private static _triangleManager = new BufferManager(Float16Array);
    static get triangleManager () { return this._triangleManager; }
    // BVH structure: 0|1 B|T B|T B|T
    private static _BVHManager = new BufferManager(Uint32Array);
    static get BVHManager () { return this._BVHManager; }
    // Bounding vertices: Bx By Bz
    private static _boundingVertexManager = new BufferManager(Float16Array);
    static get boundingVertexManager () { return this._boundingVertexManager; }

    // Default material
    static readonly DEFAULT_MATERIAL = new Material();

    // Buffers
    readonly triangles: TypedArrayView<Float16Array>;
    readonly bvh: TypedArrayView<Uint32Array>;
    readonly boundingVertices: TypedArrayView<Float16Array>;
    readonly bounding: Bounding;
    readonly material: Material;
    // Construct using arrays
    constructor(
        triangles: Float16Array | Array<number>,
        bvh: Uint32Array | Array<number>,
        boundingVertices: Float16Array | Array<number>,
        bounding: Bounding,
        material: Material
    ) {
        this.triangles = Prototype._triangleManager.allocateArray(triangles);
        this.bvh = Prototype._BVHManager.allocateArray(bvh);
        this.boundingVertices = Prototype._boundingVertexManager.allocateArray(boundingVertices);
        this.bounding = bounding;
        this.material = material;
    }


    static async fromTriangleArray(objectPrototype: ObjectPrototype) {
        const bvh: TriangleBVH = TriangleBVH.fromPrototypeArray(objectPrototype.triangles);
        // if (name) console.log("BVH", name, bvh);
        const bounding = { min: new Vector<3>(bvh.root.bounding.min.x, bvh.root.bounding.min.y, bvh.root.bounding.min.z), max: new Vector<3>(bvh.root.bounding.max.x, bvh.root.bounding.max.y, bvh.root.bounding.max.z) };
        const bvhArrays: BVHArrays = bvh.toArrays();
        // if (name) console.log("BVH Arrays", name, bvhArrays);
        return new Prototype(objectPrototype.triangles, bvhArrays.bvh, bvhArrays.boundingVertices, bounding, objectPrototype.material);
    }

    // Construct from OBJ file
    static async *fromObj(objPath: string, mtlPath: string | undefined = undefined): AsyncGenerator<Prototype> {
        let materials: Map<string, Material> = new Map();
        if (mtlPath) materials = await Parser.mtl(mtlPath);
        // Parse OBJ file
        const prototypeArrayGenerator: AsyncGenerator<ObjectPrototype> = Parser.obj(objPath, materials, true);
        // Construct prototype
        for await (const prototypeArray of prototypeArrayGenerator) {
            console.log("Object triangle count:", prototypeArray.triangles.length / TRIANGLE_SIZE);
            yield Prototype.fromTriangleArray(prototypeArray);
        }
    }

    static async fromObjStatic(objPath: string, mtlPath: string | undefined = undefined): Promise<Prototype> {
        let materials: Map<string, Material> = new Map();
        if (mtlPath) materials = await Parser.mtl(mtlPath);
        // Accumulate triangles
        let triangles: Array<number> = [];
        // Parse OBJ file
        const objectPrototypeGenerator: AsyncGenerator<ObjectPrototype> = Parser.obj(objPath, materials, false);
        for await (const objectPrototype of objectPrototypeGenerator) {
            const oldLength = triangles.length;
            triangles.length += objectPrototype.triangles.length;
            for (let i = 0; i < objectPrototype.triangles.length; i++) triangles[oldLength + i] = objectPrototype.triangles[i]!;
        }
        
        console.log("Triangle count:", triangles.length / TRIANGLE_SIZE);
        // Construct prototype does not support imported materials as only one material per instance is supported
        return Prototype.fromTriangleArray({ triangles, material: new Material() });
    }

    destroy() {
        // Free all buffers
        Prototype._triangleManager.freeArray(this.triangles);
        Prototype._BVHManager.freeArray(this.bvh);
        Prototype._boundingVertexManager.freeArray(this.boundingVertices);
    }
}