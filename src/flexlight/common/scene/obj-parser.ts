"use strict";

import { cross, normalize, Vector, vector_difference, vector_scale } from "../lib/math";
import { Material } from "./material";


export interface ObjectPrototype {
    triangles: Array<number>;
    material: Material;
}

export class Parser {
    // Create object from .obj file
    static async *obj(path: string, materials: Map<string, Material>, asSeperateObjects: boolean = true): AsyncGenerator<ObjectPrototype> {
        // Use counters to keep track of the current index of the vertices, normals and uvs
        let vertexOffset = 1;
        let normalOffset = 1;
        let uvOffset = 1;
        // Create Map for vertices, normals and uvs
        let accumulateVertices: Map<number, Array<number>> = new Map();
        let accumulateNormals: Map<number, Array<number>> = new Map();
        let accumulateUvs: Map<number, Array<number>> = new Map();
        // Create Map for vertices, normals and uvs that are used in the current object
        let oldVertices: Map<number, Array<number>> = new Map();
        let oldNormals: Map<number, Array<number>> = new Map();
        let oldUvs: Map<number, Array<number>> = new Map();
        // track current material
        let curMaterialName: string | undefined = undefined;
        // final object variable 
        let triangleCount = 0;
        let triangles: Array<number> = [];

        // fetch file and iterate over its lines
        const text = await (await fetch(path)).text();
        console.log('Parsing vertices ...');

        const lines = text.split(/\r\n|\r|\n/);
        const lineNumber = lines.length;
        // Iterate over lines
        for (let i = 0; i < lineNumber; i++) {
            // Fetch line
            const line: string = lines[i] ?? "";
            // Convert line to array of words
            let words: Array<string> = [];
            line.split(/[\t \s\s+]/g).forEach(word => { if (word.length) words.push(word) });

            let objectReference = (): ObjectPrototype | void => {
                // Only yeild object if this is not the first object
                if (triangleCount > 0) {
                    console.log("Line:", i);
                    // Clear old maps
                    oldVertices.clear();
                    oldNormals.clear();
                    oldUvs.clear();
                    // Copy old maps to reuse them as new maps without new reallocation
                    let tempVertices = oldVertices;
                    let tempNormals = oldNormals;
                    let tempUvs = oldUvs;
                    // Copy accumulated maps to use maps
                    oldVertices = accumulateVertices;
                    oldNormals = accumulateNormals;
                    oldUvs = accumulateUvs;
                    // Clear accumulate maps
                    accumulateVertices = tempVertices;
                    accumulateNormals = tempNormals;
                    accumulateUvs = tempUvs;
                    // Log object name and triangle count
                    console.log("Object name:", words[1]);
                    console.log("Triangle count:", triangleCount);

                    const material = curMaterialName ? materials.get(curMaterialName)! : new Material();
                    // Reset material name
                    curMaterialName = undefined;
                    // Yield triangles
                    return { triangles, material };
                }
                // Clear triangle array in any case
                triangles = [];
            }
            // interpret current line
            switch (words[0]) {
                case "o":
                    if (asSeperateObjects) {
                        let result = objectReference();
                        if (result) yield result;
                    }
                    break;
                case "g":
                    if (asSeperateObjects) {
                        let result = objectReference();
                        if (result) yield result;
                    }
                    break;
                case "v":
                    // push vertex
                    accumulateVertices.set(vertexOffset++, [Number(words[1]!), Number(words[2]!), Number(words[3]!)]);
                    break;
                case "vt":
                    // push uv
                    accumulateUvs.set(uvOffset++, [Number(words[1]), Number(words[2])]);
                    break;
                case "vn":
                    // push normal
                    accumulateNormals.set(normalOffset++, [Number(words[1]), Number(words[2]), Number(words[3])]);
                    break;
                case "f":
                    // Discard first word
                    let dataString = words.slice(1, words.length).join(' ');
                    // "-" or space is sperating different vertices while "/" seperates different properties
                    // extract array indecies form string
                    let data = dataString.split(/[ ]/g).filter(vertex => vertex.length).map(vertex => vertex.split(/[/]/g).map((numStr, index) => {
                        let num: number = Number(numStr);
                        if (num < 0 && index === 0) num += vertexOffset;
                        if (num < 0 && index === 1) num += uvOffset;
                        if (num < 0 && index === 2) num += normalOffset;
                        return num;
                    }));
                    
                    // test if new part should be a triangle or plane
                    if (data.length === 4 && data[0] && data[1] && data[2] && data[3]) {
                        // Quad case
                        const quadVertices: Array<Vector<3> | undefined> = [
                            oldVertices.get(data[3]![0]!) ?? accumulateVertices.get(data[3]![0]!), 
                            oldVertices.get(data[2]![0]!) ?? accumulateVertices.get(data[2]![0]!), 
                            oldVertices.get(data[1]![0]!) ?? accumulateVertices.get(data[1]![0]!), 
                            oldVertices.get(data[0]![0]!) ?? accumulateVertices.get(data[0]![0]!)
                        ].map((vertex: number[] | undefined) => vertex ? new Vector(vertex[0]!, vertex[1]!, vertex[2]!) : undefined);
                        const quadNormals: Array<Vector<3> | undefined> = [
                            oldNormals.get(data[3]![2]!) ?? accumulateNormals.get(data[3]![2]!), 
                            oldNormals.get(data[2]![2]!) ?? accumulateNormals.get(data[2]![2]!), 
                            oldNormals.get(data[1]![2]!) ?? accumulateNormals.get(data[1]![2]!), 
                            oldNormals.get(data[0]![2]!) ?? accumulateNormals.get(data[0]![2]!)
                        ].map((normal: number[] | undefined) => normal ? new Vector(normal[0]!, normal[1]!, normal[2]!) : undefined);
                        const quadUvs: Array<Vector<2> | undefined> = [
                            oldUvs.get(data[3]![1]!) ?? accumulateUvs.get(data[3]![1]!), 
                            oldUvs.get(data[2]![1]!) ?? accumulateUvs.get(data[2]![1]!), 
                            oldUvs.get(data[1]![1]!) ?? accumulateUvs.get(data[1]![1]!), 
                            oldUvs.get(data[0]![1]!) ?? accumulateUvs.get(data[0]![1]!)
                        ].map((uv: number[] | undefined) => uv ? new Vector(uv[0]!, uv[1]!) : undefined);

                        if(!quadVertices[0] || !quadVertices[1] || !quadVertices[2] || !quadVertices[3]) {
                            // console.warn("Invalid quad", quadVertices);
                            break;
                        }
                        // Triangle 3 2 1
                        triangles.push( ...quadVertices[3]!, ...quadVertices[2]!, ...quadVertices[1]!);

                        // Test if normals are defined, otherwise compute from vertices for triangle 3 2 1
                        if (quadNormals[3] && quadNormals[2] && quadNormals[1]) {
                            triangles.push( ...normalize(quadNormals[3]!), ...normalize(quadNormals[2]!), ...normalize(quadNormals[1]));
                        } else {
                            const normal = normalize(cross(vector_difference(quadVertices[1]!, quadVertices[3]!), vector_difference(quadVertices[1]!, quadVertices[2]!)));
                            triangles.push( ...normal, ...normal, ...normal);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 3 2 1
                        if (quadUvs[3] && quadUvs[2] && quadUvs[1]) {
                            triangles.push( ...quadUvs[3]!, ...quadUvs[2]!, ...quadUvs[1]!);
                        } else {
                            triangles.push(0,0, 0,1, 1,1);
                        }

                        // Triangle 1 0 3
                        triangles.push( ...quadVertices[1]!, ...quadVertices[0]!, ...quadVertices[3]);

                        // Test if normals are defined, otherwise compute from vertices for triangle 1 0 3
                        if (quadNormals[1] && quadNormals[0] && quadNormals[3]){
                            triangles.push( ...normalize(quadNormals[1]!), ...normalize(quadNormals[0]!), ...normalize(quadNormals[3]));
                        } else {
                            const normal = normalize(cross(vector_difference(quadVertices[3]!, quadVertices[1]!), vector_difference(quadVertices[3]!, quadVertices[0]!)));
                            triangles.push( ...normal, ...normal, ...normal);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 1 0 3
                        if (quadUvs[1] && quadUvs[0] && quadUvs[3]) {
                            triangles.push( ...quadUvs[1]!, ...quadUvs[0]!, ...quadUvs[3]);
                        } else {
                            triangles.push(1,1, 1,0, 0,0);
                        }
                        triangleCount += 2;
                    } else if (data.length === 3 && data[0] && data[1] && data[2]) {
                        // Triangle case
                        const triangleVertices: Array<Vector<3> | undefined> = [
                            oldVertices.get(data[2]![0]!) ?? accumulateVertices.get(data[2]![0]!), 
                            oldVertices.get(data[1]![0]!) ?? accumulateVertices.get(data[1]![0]!), 
                            oldVertices.get(data[0]![0]!) ?? accumulateVertices.get(data[0]![0]!)
                        ].map((vertex: number[] | undefined) => vertex ? new Vector(vertex[0]!, vertex[1]!, vertex[2]!) : undefined);
                        const triangleNormals: Array<Vector<3> | undefined> = [
                            oldNormals.get(data[2]![2]!) ?? accumulateNormals.get(data[2]![2]!), 
                            oldNormals.get(data[1]![2]!) ?? accumulateNormals.get(data[1]![2]!), 
                            oldNormals.get(data[0]![2]!) ?? accumulateNormals.get(data[0]![2]!)
                        ].map((normal: number[] | undefined) => normal ? new Vector(normal[0]!, normal[1]!, normal[2]!) : undefined);
                        const triangleUvs: Array<Vector<2> | undefined> = [
                            oldUvs.get(data[2]![1]!) ?? accumulateUvs.get(data[2]![1]!), 
                            oldUvs.get(data[1]![1]!) ?? accumulateUvs.get(data[1]![1]!), 
                            oldUvs.get(data[0]![1]!) ?? accumulateUvs.get(data[0]![1]!)
                        ].map((uv: number[] | undefined) => uv ? new Vector(uv[0]!, uv[1]!) : undefined);

                        if(!triangleVertices[0] || !triangleVertices[1] || !triangleVertices[2]) {
                            // console.warn("Invalid triangle", triangleVertices);
                            break;
                        }

                        // Triangle 2 1 0
                        triangles.push( ...triangleVertices[2]!, ...triangleVertices[1]!, ...triangleVertices[0]);

                        // Test if normals are defined, otherwise compute from vertices for triangle 2 1 0
                        if (triangleNormals[2] && triangleNormals[1] && triangleNormals[0]) {
                            triangles.push( ...normalize(triangleNormals[2]!), ...normalize(triangleNormals[1]!), ...normalize(triangleNormals[0]));
                        } else {
                            const normal = normalize(cross(vector_difference(triangleVertices[0]!, triangleVertices[2]!), vector_difference(triangleVertices[0]!, triangleVertices[1]!)));
                            triangles.push( ...normal, ...normal, ...normal);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 2 1 0
                        if (triangleUvs[2] && triangleUvs[1] && triangleUvs[0]) {
                            triangles.push( ...triangleUvs[2]!, ...triangleUvs[1]!, ...triangleUvs[0]);
                        } else {
                            triangles.push(0,0, 0,1, 1,1);
                        }
                        triangleCount += 1;
                    } else {
                        console.warn('Invalid face data:', data);
                    }
                    
                    break;
                case 'usemtl':
                    // Use material name for next vertices
                    if (materials[words[1] as keyof typeof materials]) {
                        curMaterialName = words[1];
                    } else {
                        console.warn('Couldn\'t resolve material', curMaterialName);
                    }
                    break;
            }
        }
        // Yeild final object till end of file
        const material = curMaterialName ? materials.get(curMaterialName)! : new Material();
        yield { triangles, material };
    }

    static mtl = async (path: string): Promise<Map<string, Material>> => {
        // Accumulate information
        let materials = new Map<string, Material>();
        let currentMaterialName: string = "";
        // line interpreter
        let interpreteLine = (line: string) => {
          let words: Array<string> = [];
          // get array of words
          line.split(/[\t \s\s+]/g).forEach(word => { if (word.length) words.push(word) });
    
          // interpret current line
          switch (words[0]) {
            case 'newmtl':
              currentMaterialName = words[1] ?? "";
              materials.set(currentMaterialName, new Material());
              break;
            case 'Ka':
              materials.get(currentMaterialName)!.color = vector_scale(new Vector(Number(words[1]), Number(words[2]), Number(words[3])), 255);
              break;
            case 'Ke':
              let emissiveness: Vector<3> = new Vector(Number(words[1]), Number(words[2]), Number(words[3]));
              materials.get(currentMaterialName)!.emissive = emissiveness;
              // Replace color if emissiveness is not 0
              break;
            case 'Ns':
              materials.get(currentMaterialName)!.metallic = Number(words[1]) / 1000;
              break;
            case 'd':
              // materials[currentMaterialName].translucency = Number(words[1]);
              // materials[currentMaterialName].roughness = 0;
              break;
            case 'Ni':
              materials.get(currentMaterialName)!.ior = Number(words[1]);
              break;
          }
        };
        // fetch file and iterate over its lines
        let text = await (await fetch(path)).text();
        console.log('Parsing materials ...');
        text.split(/\r\n|\r|\n/).forEach(line => interpreteLine(line));
        // Log materials
        console.log(materials);
        // return filled materials array
        return materials;
    }
}