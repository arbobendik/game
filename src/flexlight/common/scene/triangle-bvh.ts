"use strict";

import { BVH, BVHLeaf, BVHNode, Bounding, BVHArrays } from "./bvh";
import { cross, POW32M1, Vector, vector_add, vector_difference, vector_length, vector_scale } from "../lib/math";
import { TRIANGLE_SIZE } from "./prototype";


export const BVH_MAX_TRIANGLES_PER_LEAF = 2;
export const BVH_MAX_CHILDREN_PER_NODE = 2;


export class Triangle {
    a: Vector<3>;
    b: Vector<3>;
    c: Vector<3>;
    id: number;
    readonly area: number;

    constructor(a: Vector<3>, b: Vector<3>, c: Vector<3>, id: number) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.id = id;

        this.area = vector_length(cross(vector_difference(this.b, this.a), vector_difference(this.c, this.a))) * 0.5;
    }

    *[Symbol.iterator]() {
        yield this.a;
        yield this.b;
        yield this.c;
    }
}

// Triangle BVH class for constructing static BVHs for triangle meshes
export class TriangleBVH extends BVH<Triangle> {
    constructor(triangles: Array<Triangle>) {
        const root = TriangleBVH.subdivideTree(triangles, 0, POW32M1);
        super(root);
    }

    toArrays(): BVHArrays {
        const boundingVertices: Array<number> = [];
        const bvh: Array<number> = [];
        // Traverse tree using depth first search starting from root
        /*
        this.dfsTraverseBinary( 
            (node: BVHNode<Triangle>, sibling: BVHNode<Triangle> | BVHLeaf<Triangle> | undefined) => {
                // boundingVertices.push(node.bounding.min.x, node.bounding.min.y, node.bounding.min.z, node.bounding.max.x, node.bounding.max.y, node.bounding.max.z);
                console.log("NODE", node, "\n SIBLING", sibling);
                boundingVertices.push(  ...(node.children[0]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[0]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ...(node.children[1]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[1]?.bounding.max ?? new Vector(0, 0, 0)));

                // boundingVertices.push(  ...(sibling?.bounding.min ?? new Vector(0, 0, 0)), ...(sibling?.bounding.max ?? new Vector(0, 0, 0)));
                
                bvh.push(1, node.parentId, sibling?.id ?? POW32M1, node.children[0]?.id ?? POW32M1, node.children[1]?.id ?? POW32M1);
            },
            (leaf: BVHLeaf<Triangle>, sibling: BVHNode<Triangle> | BVHLeaf<Triangle> | undefined) => {
                // boundingVertices.push(leaf.bounding.min.x, leaf.bounding.min.y, leaf.bounding.min.z, leaf.bounding.max.x, leaf.bounding.max.y, leaf.bounding.max.z);
                boundingVertices.push(... new Vector({vector_length: 12}));
                console.log("LEAF", leaf, "\n SIBLING", sibling);
                // boundingVertices.push(  ...(sibling?.bounding.min ?? new Vector(0, 0, 0)), ...(sibling?.bounding.max ?? new Vector(0, 0, 0)));
                bvh.push(0, leaf.parentId, sibling?.id ?? POW32M1, leaf.children[0]?.id ?? POW32M1, leaf.children[1]?.id ?? POW32M1);
            },
            this.root
        );
        */
        
        this.dfsTraverse(
            (node: BVHNode<Triangle>) => {
                boundingVertices.push(  ...(node.children[0]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[0]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ...(node.children[1]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[1]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ... new Vector({ vector_length: 8 }));
                bvh.push(1, node.children[0]?.id ?? POW32M1, node.children[1]?.id ?? POW32M1, POW32M1);
            },
            (leaf: BVHLeaf<Triangle>) => {
                boundingVertices.push(  ...(leaf.children[0]?.a ?? new Vector(0, 0, 0)), ...(leaf.children[0]?.b ?? new Vector(0, 0, 0)), ...(leaf.children[0]?.c ?? new Vector(0, 0, 0)),
                                        ...(leaf.children[1]?.a ?? new Vector(0, 0, 0)), ...(leaf.children[1]?.b ?? new Vector(0, 0, 0)), ...(leaf.children[1]?.c ?? new Vector(0, 0, 0)),
                                        ... new Vector({ vector_length: 2 }));

                bvh.push(0, leaf.children[0]?.id ?? POW32M1, leaf.children[1]?.id ?? POW32M1, POW32M1);
            },
            this.root
        );
        
        return { boundingVertices, bvh };
    }

    private static isTriangleInBounding(triangle: Triangle, bound: Bounding): boolean {
        return super.isVertexInBounding(triangle.a, bound) && super.isVertexInBounding(triangle.b, bound) && super.isVertexInBounding(triangle.c, bound);
    }

    private static tightenBounding(triangles: Array<Triangle>): Bounding {

        const BIASFP16 = 0.0009765625;

        let bounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
        for (let triangle of triangles) {
            for (let vertex of triangle) {
                bounding.min.x = Math.min(bounding.min.x, vertex.x - BIASFP16);
                bounding.min.y = Math.min(bounding.min.y, vertex.y - BIASFP16);
                bounding.min.z = Math.min(bounding.min.z, vertex.z - BIASFP16);
                bounding.max.x = Math.max(bounding.max.x, vertex.x + BIASFP16);
                bounding.max.y = Math.max(bounding.max.y, vertex.y + BIASFP16);
                bounding.max.z = Math.max(bounding.max.z, vertex.z + BIASFP16);
            }
        }
        return bounding;
    }

    private static fillFlatTree(triangles: Array<Triangle>, startingId: number, parentId: number): BVHNode<Triangle> | BVHLeaf<Triangle> {
        // Tighten bounding
        let vertices: Array<Vector<3>> = [];
        for (let triangle of triangles) for (let vertex of triangle) vertices.push(vertex);
        const bounding = TriangleBVH.tightenBounding(triangles);
        // Base case: if there are less than BVH_MAX_TRIANGLES_PER_LEAF triangles, return a leaf
        if (triangles.length <= BVH_MAX_TRIANGLES_PER_LEAF) return new BVHLeaf(triangles, bounding, startingId, startingId + 1);

        const trianglesPerChild: number = Math.ceil(triangles.length / BVH_MAX_CHILDREN_PER_NODE);

        const children: Array<BVHNode<Triangle> | BVHLeaf<Triangle>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        for (let i = 0; i < triangles.length; i += trianglesPerChild) {
            const childTriangles = triangles.slice(i, Math.min(i + trianglesPerChild, triangles.length + 1));
            // const child = TriangleBVH.fillFlatTree(childTriangles, nextId, startingId);
            const child = TriangleBVH.subdivideTree(childTriangles, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }


    private static evaluateSplitCost(triangles: Array<Triangle>, bounding0: Bounding, bounding1: Bounding): number {
        // Calculate the number of triangles that are in both bounding volumes
        let trianglesIn0 = 0;
        let trianglesIn0Area = 0;
        let trianglesIn1 = 0;
        let trianglesIn1Area = 0;
        for (let triangle of triangles) {
            const in0 = TriangleBVH.isTriangleInBounding(triangle, bounding0);
            const in1 = TriangleBVH.isTriangleInBounding(triangle, bounding1);
            if (in1) {
                trianglesIn1++;
                trianglesIn1Area += triangle.area;
            } else {
                trianglesIn0++;
                trianglesIn0Area += triangle.area;
            }
            // else trianglesOnCutoff++;
        }

        // const triangleCount = triangles.length;
        // If one box contains all triangles, the cost is Infinity as no subdivision is happening.
        // if (trianglesIn0 === triangleCount || trianglesIn1 === triangleCount || trianglesOnCutoff === triangleCount) return Infinity;
        if (trianglesIn0 === 0 || trianglesIn1 === 0) return Infinity;
        // Minimize for minimum triangles on cutoff and equal distribution of triangles across bounding0 and bounding1.
        return Math.abs(trianglesIn0Area - trianglesIn1Area);
    }

    private static subdivideTree(triangles: Array<Triangle>, startingId: number = 0, parentId: number = 0): BVHNode<Triangle> | BVHLeaf<Triangle> {
        // Tighten bounding
        const bounding = TriangleBVH.tightenBounding(triangles);
        // Base case: if there are less than BVH_MAX_CHILDREN_PER_NODE triangles, return a leaf
        if (triangles.length <= BVH_MAX_TRIANGLES_PER_LEAF) {
            // console.log("LEAF", triangles.length, depth, maxDepth);
            return new BVHLeaf(triangles, bounding, startingId, startingId + 1);
        }

        // Split bounding into two sub bounding volumes along the axis minimizing the cost of triangle split
        let vertexSum: Vector<3> = new Vector(0, 0, 0);
        for (let triangle of triangles) for (let vertex of triangle) {
            vertexSum = vector_add(vertexSum, vertex);
        }
        
        // const centerOfMass = vector_scale(vector_add(bounding.min, bounding.max), 0.5); //vector_scale(vertexSum, 1 / (triangles.length * 3));

        const intervals = 2;

        let splitAlongAxis: "x" | "y" | "z" = "x";
        let splitAt: number = 0;
        let minCost: number = Infinity;
        for (let axis of ["x", "y", "z"] as Array<"x" | "y" | "z">) {
            let splitDistIncrement = (bounding.max[axis] - bounding.min[axis]) / intervals;

            for (let i = 1; i < intervals; i++) {
                const bounding0Max = new Vector(bounding.max);
                const bounding1Min = new Vector(bounding.min);
                bounding0Max[axis] = bounding.min[axis] + i * splitDistIncrement;
                bounding1Min[axis] = bounding.min[axis] + i * splitDistIncrement;
                // Define two bounding volumes
                const bounding0 = { min: bounding.min, max: bounding0Max };
                const bounding1 = { min: bounding1Min, max: bounding.max };

                const cost = TriangleBVH.evaluateSplitCost(triangles, bounding0, bounding1);
                // console.log(cost);
                if (cost < minCost) {
                    minCost = cost;
                    splitAlongAxis = axis;
                    splitAt = bounding.min[axis] + i * splitDistIncrement;
                }
            }
        }
        // If no subdivision is happening, return flat tree to avoid infinite recursion and unnecessary 
        if (minCost === Infinity) {
            // console.warn("No spacial subdivision possible for", triangles.length, "triangles.");
            return TriangleBVH.fillFlatTree(triangles, startingId, parentId);
        }

        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[splitAlongAxis] = splitAt;
        bounding1Min[splitAlongAxis] = splitAt;

        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Sort triangles into bounding volumes
        const trianglesInBound0 = [];
        const trianglesInBound1 = [];
        // const trianglesOnCutoff = [];

        for (let triangle of triangles) {
            const in0 = TriangleBVH.isTriangleInBounding(triangle, bounding0);
            const in1 = TriangleBVH.isTriangleInBounding(triangle, bounding1);
            // Triangle is solely in bounding0
            if (in1) trianglesInBound1.push(triangle);
            // Triangle is solely in bounding1
            // Triangle is neither fully in bounding0 nor bounding1
            else trianglesInBound0.push(triangle);
            // else trianglesInBound0.push(triangle);
        }

        let children: Array<BVHNode<Triangle> | BVHLeaf<Triangle>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        // Recursively subdivide bounding volumes if respective bounding volumes contain triangles
        if (trianglesInBound0.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesInBound0, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }
        /*
        if (trianglesOnCutoff.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesOnCutoff, maxDepth, depth + 1, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }
        */

        if (trianglesInBound1.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesInBound1, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode<Triangle>(children, bounding, startingId, nextId);
    }

    static fromPrototypeArray(prototypeArray: Array<number>): TriangleBVH {
        let triangles: Array<Triangle> = [];
        // Iterate over triangles in format V V V N N N UV UV UV
        for (let i = 0; i < prototypeArray.length; i += TRIANGLE_SIZE) {
            /*
            console.log(prototypeArray[i], prototypeArray[i + 1], prototypeArray[i + 2], prototypeArray[i + 3]);
            console.log(prototypeArray[i + 4], prototypeArray[i + 5], prototypeArray[i + 6], prototypeArray[i + 7]);
            console.log(prototypeArray[i + 8], prototypeArray[i + 9], prototypeArray[i + 10], prototypeArray[i + 11]);
            */
            triangles.push(new Triangle(
                new Vector(
                    prototypeArray[i]!,
                    prototypeArray[i + 1]!,
                    prototypeArray[i + 2]!
                ),
                new Vector(
                    prototypeArray[i + 3]!,
                    prototypeArray[i + 4]!,
                    prototypeArray[i + 5]!
                ),
                new Vector(
                    prototypeArray[i + 6]!,
                    prototypeArray[i + 7]!,
                    prototypeArray[i + 8]!
                ),
                i / TRIANGLE_SIZE
            ));
        }
        // Subdivide tree
        return new TriangleBVH(triangles);
    }

    destroy() {
        this.root.destroy();
    }
}
