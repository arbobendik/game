"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Vector, Matrix, IdentityMatrix, matrix_scale, moore_penrose, ZeroVector, SphericalRotationMatrix, vector_scale, matrix_mul } from "../lib/math";



export class Transform {
  // M11 M12 M13 M21 M22 M23 M31 M32 M33 X Y Z S
  // private static _instanceFloatManager = new BufferManager(Float32Array);
  //static get transformManager () { return Transform._instanceFloatManager; }
  private readonly _instanceFloatManager;
  readonly transformArray: TypedArrayView<Float32Array>;

  // Add one identity matrix transform at position 0 to default to.
  // static readonly DEFAULT_TRANSFORM: Transform = new Transform();

  private _rotationMatrix: Matrix<3, 3>;
  private _position: Vector<3>;
  private _scaleFactor: Vector<3>;

  private updateMatrix(): void {
    const matrix: Matrix<3, 3> = matrix_mul(this._rotationMatrix, new Matrix(
      [this._scaleFactor.x, 0, 0],
      [0, this._scaleFactor.y, 0],
      [0, 0, this._scaleFactor.z]
    ));
    // Compute inverse matrix
    const inverse: Matrix<3, 3> = moore_penrose(matrix);
    // Set transform array
    this.transformArray.set(matrix[0]!, 0);
    this.transformArray.set(matrix[1]!, 4);
    this.transformArray.set(matrix[2]!, 8);
    // Set inverse rotation matrix
    this.transformArray.set(inverse[0]!, 16);
    this.transformArray.set(inverse[1]!, 20);
    this.transformArray.set(inverse[2]!, 24);
    // Update gpu buffer if it exists
    // For matrix and inverse matrix
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset, 12);
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset + 16 * this.transformArray.BYTES_PER_ELEMENT, 12);
  }
  
  set rotationMatrix(matrix: Matrix<3, 3>) {
    // Set rotation matrix
    this._rotationMatrix = matrix;
    this.updateMatrix();
  }

  get rotationMatrix(): Matrix<3, 3> {
    return this._rotationMatrix;
  }

  get matrix(): Matrix<3, 3> {
    return matrix_mul(this._rotationMatrix, new Matrix(
      [this._scaleFactor.x, 0, 0],
      [0, this._scaleFactor.y, 0],
      [0, 0, this._scaleFactor.z]
    ));
  }

  set position(position: Vector<3> ) {
    this._position = position;
    this.transformArray.set(this._position, 12);
    this.transformArray.set(vector_scale(this._position, - 1), 28);
    // console.log("TRANSFORM ARRAY", Array.from(... this.transformArray));
    // Update gpu buffer if it exists for position and negative position
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset + 12 * this.transformArray.BYTES_PER_ELEMENT, 4);
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset + 28 * this.transformArray.BYTES_PER_ELEMENT, 4);
  }

  move (x: number, y: number, z: number): void {
    this._position = new Vector(x, y, z);
    this.transformArray.set(this._position, 12);
    this.transformArray.set(vector_scale(this._position, - 1), 28);
    // Update gpu buffer if it exists for position and negative position
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset + 12 * this.transformArray.BYTES_PER_ELEMENT, 4);
    this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset + 28 * this.transformArray.BYTES_PER_ELEMENT, 4);
  }

  get position(): Vector<3> {
    return this._position;
  }

  scale (s: number | Vector<3>): void {
    if (s instanceof Vector) {
      this._scaleFactor = s;
    } else {
      this._scaleFactor = new Vector(s, s, s);
    }
    this.updateMatrix();
  }

  scaleX (x: number): void {
    this._scaleFactor.x = x;
    this.updateMatrix();
  }

  scaleY (y: number): void {
    this._scaleFactor.y = y;
    this.updateMatrix();
  }

  scaleZ (z: number): void {
    this._scaleFactor.z = z;
    this.updateMatrix();
  }

  rotateAxis (normal: Vector<3>, theta: number): void {
    let n: Vector<3> = normal;
    let sT: number = Math.sin(theta);
    let cT: number = Math.cos(theta);
    this._rotationMatrix = new Matrix(
      [n.x * n.x * (1 - cT) + cT,          n.x * n.y * (1 - cT) - n.z * sT,    n.x * n.z * (1 - cT) + n.y * sT],
      [n.x * n.y * (1 - cT) + n.z * sT,    n.y * n.y * (1 - cT) + cT,          n.y * n.z * (1 - cT) - n.x * sT],
      [n.x * n.z * (1 - cT) - n.y * sT,    n.y * n.z * (1 - cT) + n.x * sT,    n.z * n.z * (1 - cT) + cT]
    );
    this.updateMatrix();
  }

  rotateSpherical (theta: number, psi: number): void {
    this._rotationMatrix = new SphericalRotationMatrix(theta, psi);
    this.updateMatrix();
  }

  constructor (instanceFloatManager: BufferManager<Float32Array>) {
    this._instanceFloatManager = instanceFloatManager;
    // Default to identity matrix.
    this._rotationMatrix = new IdentityMatrix(3);
    this._position = new ZeroVector(3);
    this._scaleFactor = new Vector(1, 1, 1);
    // Assign next larger available number.
    this.transformArray = this._instanceFloatManager.allocateArray([
      // rotation matrix
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      // position
      0, 0, 0, 0,
      // inverse rotation matrix
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      // negative position
      0, 0, 0, 0
    ]);
    // Update gpu buffer if it exists
    // this._instanceFloatManager.gpuBufferManager?.update(this.transformArray.byteOffset, 32);
  }
  
  destroy (): void {
    this._instanceFloatManager.freeArray(this.transformArray);
  }
}



/*
static buildWGL2Arrays = (): { rotationBuffer: Float32Array, shiftBuffer: Float32Array } => {
  let length: number = Transform.transformList.length;
  // Create UBO buffer array
  let rotationBuffer: Float32Array = new Float32Array(24 * length);
  let shiftBuffer: Float32Array = new Float32Array(8 * length);
  // Iterate over set elements
  for (let i: number = 0; i < length; i++) {
    let transform: Transform = Transform.transformList[i] ?? Transform.DEFAULT_TRANSFORM;
    let matrix: Matrix<3, 3> = transform.matrix;
    let inverse: Matrix<3, 3> = moore_penrose(matrix);
    let pos: Vector<3> = transform.position;
    let invPos: Vector<3> = vector_scale(transform.position, - 1);
    rotationBuffer.set(matrix[0]!, i * 24);
    rotationBuffer.set(matrix[1]!, i * 24 + 4);
    rotationBuffer.set(matrix[2]!, i * 24 + 8);
    rotationBuffer.set(inverse[0]!, i * 24 + 12);
    rotationBuffer.set(inverse[1]!, i * 24 + 16);
    rotationBuffer.set(inverse[2]!, i * 24 + 20);
    shiftBuffer.set(pos, i * 8);
    shiftBuffer.set(invPos, i * 8 + 4);
  }

  return { rotationBuffer, shiftBuffer };
}

static buildWGPUArray = (): Float32Array => {
  let length: number = Transform.transformList.length;
  // Create UBO buffer array
  let transfromBuffer: Float32Array = new Float32Array(32 * length);
  // Iterate over set elements
  for (let i: number = 0; i < length; i++) {
    let transform: Transform = Transform.transformList[i] ?? Transform.DEFAULT_TRANSFORM;
    let matrix: Matrix<3, 3> = transform.matrix;
    let inverse: Matrix<3, 3> = moore_penrose(matrix);
    let pos: Vector<3> = transform.position;
    let invPos: Vector<3> = vector_scale(transform.position, - 1);
    transfromBuffer.set(matrix[0]!, i * 32);
    transfromBuffer.set(matrix[1]!, i * 32 + 4);
    transfromBuffer.set(matrix[2]!, i * 32 + 8);
    transfromBuffer.set(pos, i * 32 + 12);
    transfromBuffer.set(inverse[0]!, i * 32 + 16);
    transfromBuffer.set(inverse[1]!, i * 32 + 20);
    transfromBuffer.set(inverse[2]!, i * 32 + 24);
    transfromBuffer.set(invPos, i * 32 + 28);
  }

  return transfromBuffer;
}
*/
