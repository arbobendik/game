const KERNEL_SIZE: u32 = 3u;
const NUM_SAMPLES: u32 = KERNEL_SIZE * KERNEL_SIZE;
const POW32U: u32 = 4294967295u;

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

@group(0) @binding(0) var compute_out: texture_2d<f32>;
@group(0) @binding(1) var canvas_out: texture_storage_2d<rgba8unorm, write>;

@group(1) @binding(0) var<uniform> uniforms_float: UniformFloat;
@group(1) @binding(1) var<uniform> uniforms_uint: UniformUint;

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
    if (screen_pos.x > uniforms_uint.render_size.x || screen_pos.y > uniforms_uint.render_size.y) {
        return;
    }

    

    // Sample a square neighborhood (KERNEL_SIZE x KERNEL_SIZE).
    var samples: array<vec3<f32>, NUM_SAMPLES>;
    var idx: u32 = 0u;
    let half: i32 = i32(KERNEL_SIZE) / 2;

    for (var dy: i32 = -half; dy <= half; dy = dy + 1) {
        for (var dx: i32 = -half; dx <= half; dx = dx + 1) {
            // Load neighbor texel with clamping.
            let offset: vec2<i32> = vec2<i32>(dx, dy);
            let neighbor: vec4<f32> = loadNeighbour(screen_pos, offset);
            samples[idx] = neighbor.xyz;
            idx = idx + 1u;
        }
    }

    // Get the median color from the square neighborhood for each channel.
    // var r_vals: array<f32, NUM_SAMPLES>;
    // var g_vals: array<f32, NUM_SAMPLES>;
    // var b_vals: array<f32, NUM_SAMPLES>;
    var gray_vals: array<f32, NUM_SAMPLES>;
    for (var i: u32 = 0u; i < NUM_SAMPLES; i = i + 1u) {
        // r_vals[i] = samples[i].x;
        // g_vals[i] = samples[i].y;
        // b_vals[i] = samples[i].z;
        gray_vals[i] = length(samples[i].xyz);
    }
    // let med_r: f32 = median(r_vals);
    // let med_g: f32 = median(g_vals);
    // let med_b: f32 = median(b_vals);
    let med_gray: u32 = median(gray_vals);
    // Get the alpha value from the central texel.
    

    let center_texel: vec4<f32> = textureLoad(compute_out, screen_pos, 0);
    var median_color: vec3<f32> = samples[med_gray].xyz;//vec3<f32>(med_r, med_g, med_b);
    /*

    let delta = (median_color - center_texel.xyz);
    let delta_length = length(delta);
    if(delta_length < 0.05) {
        median_color = center_texel.xyz;
    }
    if (screen_pos.x >= 1280u) {
        median_color = center_texel.xyz;
    }

    */

    let alpha: f32 = center_texel.w;

    // Apply tone mapping if required.
    if (uniforms_uint.tonemapping_operator == 1u) {
        // Apply Reinhard tone mapping.
        median_color = median_color / (median_color + vec3<f32>(1.0));
    }

    /*
    if (abs(screen_pos.x - 1280u) < 10u) {
        median_color = vec3<f32>(1.0, 0.0, 0.0);
    }
    */

    // Write the final color to canvas.
    textureStore(canvas_out, screen_pos, vec4<f32>(median_color, alpha));
}


// Helper function to load a neighbor texel with clamping.
fn loadNeighbour(center: vec2<u32>, offset: vec2<i32>) -> vec4<f32> {
    let renderSize: vec2<i32> = vec2<i32>(i32(uniforms_uint.render_size.x), i32(uniforms_uint.render_size.y));
    let pos: vec2<i32> = vec2<i32>(i32(center.x), i32(center.y)) + offset;
    let clamped: vec2<i32> = clamp(pos, vec2<i32>(0, 0), renderSize - vec2<i32>(1, 1));
    return textureLoad(compute_out, vec2<u32>(u32(clamped.x), u32(clamped.y)), 0);
}

// Helper function to compute the median of an array of NUM_SAMPLES floats using merge sort.
fn median(values: array<f32, NUM_SAMPLES>) -> u32 {
    // Copy the input values into an array to be sorted.
    var a: array<f32, NUM_SAMPLES> = values;
    var temp: array<f32, NUM_SAMPLES>;
    let n: u32 = NUM_SAMPLES;
    var width: u32 = 1u;

    // Iterative bottom-up merge sort.
    while (width < n) {
        for (var i: u32 = 0u; i < n; i = i + width * 2u) {
            // Set boundaries for the subarrays.
            var left: u32 = i;
            var right: u32 = i + width;
            let left_end: u32 = min(i + width, n);
            let right_end: u32 = min(i + width * 2u, n);
            var index: u32 = i;

            // Merge the two subarrays.
            while (left < left_end && right < right_end) {
                if (a[left] <= a[right]) {
                    temp[index] = a[left];
                    left = left + 1u;
                } else {
                    temp[index] = a[right];
                    right = right + 1u;
                }
                index = index + 1u;
            }

            // Copy any remaining elements from the left subarray.
            while (left < left_end) {
                temp[index] = a[left];
                left = left + 1u;
                index = index + 1u;
            }

            // Copy any remaining elements from the right subarray.
            while (right < right_end) {
                temp[index] = a[right];
                right = right + 1u;
                index = index + 1u;
            }
        }
        // Copy the merged results back into a for the next iteration.
        for (var j: u32 = 0u; j < n; j = j + 1u) {
            a[j] = temp[j];
        }
        width = width * 2u;
    }

    // Return the median element.
    return n / 2u;
}
