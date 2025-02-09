const POW32U: u32 = 4294967295u;
const POW23M1: f32 = 8388607.0f;
const POW23M1U: u32 = 8388607u;
const INV_255: f32 = 0.00392156862745098f;
const UINT_MAX: u32 = 4294967295u;

struct Transform {
    rotation: mat3x3<f32>,
    shift: vec3<f32>,
};

struct UniformFloat {
    view_matrix: mat3x3<f32>,
    inv_view_matrix: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    min_importancy: f32,
};

struct UniformUint {
    render_size: vec2<u32>,
    temporal_target: u32,
    temporal_max: u32,
    is_temporal: u32,

    samples: u32,
    max_reflections: u32,

    tonemapping_operator: u32,
};

@group(0) @binding(0) var accumulated_float: texture_2d_array<f32>;
@group(0) @binding(1) var accumulated_uint: texture_2d_array<u32>;
@group(0) @binding(2) var shift_out_float: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(3) var shift_out_uint: texture_storage_2d_array<rgba32uint, write>;
@group(0) @binding(4) var texture_absolute_position: texture_2d<f32>;
@group(0) @binding(5) var<storage, read> offset_buffer: array<u32>;
@group(0) @binding(6) var<storage, read_write> shift_lock: array<atomic<u32>>;

@group(1) @binding(0) var<uniform> uniforms_float: UniformFloat;
@group(1) @binding(1) var<uniform> uniforms_uint: UniformUint;
@group(1) @binding(2) var<storage, read> instance_transform: array<Transform>;

@compute
@workgroup_size(8, 8)
fn compute(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
    @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    // Get texel position of screen
    let screen_pos: vec2<u32> = global_invocation_id.xy;

    let accumulated_float_0: vec4<f32> = textureLoad(accumulated_float, screen_pos, 0, 0);
    // let accumulated_float_1: vec4<f32> = textureLoad(accumulated_float, screen_pos, 1, 0);
    let accumulated_uint_0: vec4<u32> = textureLoad(accumulated_uint, screen_pos, 0, 0);
    let accumulated_uint_1: vec4<u32> = textureLoad(accumulated_uint, screen_pos, 1, 0);
    let accumulated_uint_2: vec4<u32> = textureLoad(accumulated_uint, screen_pos, 2, 0);

    // Extract color value from old position
    /*
    let fine_color_acc: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_0.x), unpack2x16float(accumulated_0.y));
    let fine_color_low_acc: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_0.z), unpack2x16float(accumulated_0.w));
    let coarse_color_acc: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_1.x), unpack2x16float(accumulated_1.y));
    let coarse_color_low_acc: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_1.z), unpack2x16float(accumulated_1.w));   
    */
    // Extract 3d position value
    let rel_position_old: vec4<f32> = accumulated_float_0;
    // let abs_position_old: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_2.z), unpack2x16float(accumulated_2.w));


    let old_temporal_target: u32 = accumulated_uint_2.x;
    let old_instance_index: u32 = accumulated_uint_2.y;
    // Map postion according to current camera positon and view matrix to clip space
    let transform: Transform = instance_transform[old_instance_index * 2u];
    let absolute_position_old: vec3<f32> = transform.rotation * rel_position_old.xyz + transform.shift;
    let clip_space_old: vec3<f32> = uniforms_float.view_matrix * (absolute_position_old - uniforms_float.camera_position);
    // Project onto screen and shift origin to the corner
    let screen_space_old: vec2<f32> = (clip_space_old.xy / clip_space_old.z) * 0.5 + 0.5;
    // Translate to texel value
    let coord: vec2<u32> = vec2<u32>(
        u32((f32(uniforms_uint.render_size.x) * screen_space_old.x)),
        u32((f32(uniforms_uint.render_size.y) * (1.0f - screen_space_old.y)))
    );

    let inv_transform: Transform = instance_transform[old_instance_index * 2u + 1u];
    let absolute_position_cur: vec3<f32> = textureLoad(texture_absolute_position, coord, 0).xyz;
    let rel_position_cur: vec3<f32> = inv_transform.rotation * (absolute_position_cur.xyz + inv_transform.shift);

    let buffer_index: u32 = coord.x + uniforms_uint.render_size.x * coord.y;

    let instance_index: u32 = offset_buffer[buffer_index * 2u] - 1u;//offset_buffer[buffer_index];
    // let cur_depth: f32 = bitcast<f32>(UINT_MAX - depth_buffer[buffer_index]);
    let old_depth: f32 = clip_space_old.z;
    // If absolute position is all zeros then there is nothing to do
    let dist: f32 = distance(rel_position_cur, rel_position_old.xyz);

    if (
        // Still on the same instance
        old_instance_index == instance_index
        // Pixel are close enough to each other
        && dist <= old_depth * 8.0f / f32(uniforms_uint.render_size.x)
        // Pixel is from last frame
        && old_temporal_target == uniforms_uint.temporal_target
    ) {
        // Attempt to aquire lock.
        let lock: u32 = atomicOr(&shift_lock[buffer_index], 1u);
        if (lock == 1u) {
            // If lock is already set then another thread is already working on this pixel
            return;
        }
        // Write to shift buffer
        textureStore(shift_out_float, coord, 0, accumulated_float_0);
        
        textureStore(shift_out_uint, coord, 0, accumulated_uint_0);
        textureStore(shift_out_uint, coord, 1, accumulated_uint_1);
        textureStore(shift_out_uint, coord, 2, accumulated_uint_2);

        // Release lock.
        atomicStore(&shift_lock[buffer_index], 0u);
    }
}