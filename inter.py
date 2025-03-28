import math
import numpy as np
import rasterio
from rasterio.transform import rowcol, Affine
import matplotlib.pyplot as plt
from scipy.interpolate import RectBivariateSpline, splprep, splev
from scipy.ndimage import gaussian_filter, gaussian_filter1d
import cv2

# --------------------
# PARAMETERS
# --------------------
DEM_TIF_PATH = "./assets/elevationMaps/master.tif"  # Input DEM (EPSG:4326)
OUTPUT_TIF_PATH = "./interpolated_cliff_aware.tif"  # Output GeoTIFF path
OUTPUT_PNG_PATH = "./interpolated_cliff_aware.png"  # Output PNG for visualization
UPSCALE_FACTOR = 8  # Upscale factor (e.g., 8x)
CENTER_LAT = 56.123977978194446  # Center latitude (WGS84)
CENTER_LON = -3.9481534416499016  # Center longitude (WGS84)
WINDOW_SIZE_M = 1000  # 1 km x 1 km window

# Cliff detection parameters
CLIFF_THRESHOLD = 12.0  # Minimum elevation change to be considered a cliff (meters)
CLIFF_MIN_LENGTH = 5  # Minimum length of a cliff in pixels (filter out noise)
CLIFF_WIDTH_PERCENT = 0.2  # Percentage of elevation change attributed to cliff (20%)
SIDE_PERCENT = 0.4  # Percentage of elevation change on either side (40%)
SMOOTHING_SIGMA = 1.0  # Gaussian smoothing parameter

# New parameter: maximum allowed difference (in DEM units) between adjacent cells along a line
CELL_SIMILARITY_THRESHOLD = 10

# --------------------
# HELPER FUNCTIONS
# --------------------
def save_dem_as_tiff(dem, transform, crs, out_path):
    """Save a 2D DEM array as a GeoTIFF."""
    profile = {
        'driver': 'GTiff',
        'height': dem.shape[0],
        'width': dem.shape[1],
        'count': 1,
        'dtype': 'float32',
        'crs': crs,
        'transform': transform,
    }
    with rasterio.open(out_path, 'w', **profile) as dst:
        dst.write(dem, 1)
    # (No logging)

def detect_cliff_edges(dem, threshold=CLIFF_THRESHOLD):
    """
    Detect cliff edges manually by computing the gradient magnitude using finite differences.
    Each pixel's gradient is computed pairwise (comparing the center pixel with each neighbor),
    and the maximum absolute difference is taken.
    Returns a binary cliff mask and a gradient magnitude array.
    """
    rows, cols = dem.shape
    magnitude = np.zeros_like(dem)
    norm_factor = np.sqrt(2)

    # Loop through each pixel (excluding border pixels)
    for row in range(1, rows - 1):
        for col in range(1, cols - 1):
            center_pixel = dem[row, col]
            # Pairwise comparisons: each gradient is the absolute difference between center and neighbor.
            grad_x_left   = abs(center_pixel - dem[row, col - 1])
            grad_x_right  = abs(center_pixel - dem[row, col + 1])
            grad_y_top    = abs(center_pixel - dem[row - 1, col])
            grad_y_bottom = abs(center_pixel - dem[row + 1, col])
            # Diagonals normalized by sqrt(2)
            grad_diag_tl = abs(center_pixel - dem[row - 1, col - 1]) / norm_factor
            grad_diag_tr = abs(center_pixel - dem[row - 1, col + 1]) / norm_factor
            grad_diag_bl = abs(center_pixel - dem[row + 1, col - 1]) / norm_factor
            grad_diag_br = abs(center_pixel - dem[row + 1, col + 1]) / norm_factor

            local_max_grad = max(grad_x_left, grad_x_right, grad_y_top, grad_y_bottom,
                                 grad_diag_tl, grad_diag_tr, grad_diag_bl, grad_diag_br)
            magnitude[row, col] = local_max_grad

    # Create binary mask where gradient magnitude exceeds the cliff threshold.
    cliff_mask = magnitude > threshold
    return cliff_mask, magnitude

def extract_cliff_lines(cliff_mask, dem, min_length=CLIFF_MIN_LENGTH, similarity_threshold=CELL_SIMILARITY_THRESHOLD):
    """
    Extract continuous cliff lines from the binary cliff mask.
    This version splits a contour if consecutive pixels have DEM values differing by more than the similarity threshold.
    Returns a list of cliff line segments (each a set of points).
    """
    cliff_mask_uint8 = cliff_mask.astype(np.uint8) * 255
    contours, _ = cv2.findContours(cliff_mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cliff_lines = []
    for contour in contours:
        if len(contour) < min_length:
            continue

        segments = []
        current_segment = [contour[0][0]]  # contour is a list of points wrapped in extra arrays

        # Iterate over contour points starting from the second one.
        for pt_arr in contour[1:]:
            pt = pt_arr[0]  # Unwrap the point (x, y)
            current_val = dem[pt[1], pt[0]]
            prev_pt = current_segment[-1]
            prev_val = dem[prev_pt[1], prev_pt[0]]
            # If the difference in DEM values is within the threshold, continue the segment.
            if abs(current_val - prev_val) <= similarity_threshold:
                current_segment.append(pt)
            else:
                # End current segment and start a new one if current segment is long enough.
                if len(current_segment) >= min_length:
                    segments.append(np.array(current_segment))
                current_segment = [pt]
        # Append any remaining segment if long enough.
        if len(current_segment) >= min_length:
            segments.append(np.array(current_segment))
        # Add all segments from this contour to the list of cliff lines.
        cliff_lines.extend(segments)
    return cliff_lines

def fit_parametric_curve(points, smoothness=0.8):
    """
    Fit a parametric spline to a set of points.
    Returns the spline parameters and an evaluation function.
    """
    if len(points) < 4:
        return None, None

    points = np.array(points)
    points = np.unique(points, axis=0)
    if len(points) < 4:
        return None, None

    try:
        t = np.zeros(len(points))
        for i in range(1, len(points)):
            t[i] = t[i - 1] + np.sqrt(np.sum((points[i] - points[i - 1]) ** 2))
        if t[-1] > 0:
            t = t / t[-1]
        else:
            return None, None
        tck, u = splprep([points[:, 0], points[:, 1]], u=t, s=smoothness)
        def eval_spline(num_points):
            u_new = np.linspace(0, 1, num_points)
            return np.array(splev(u_new, tck)).T
        return tck, eval_spline
    except Exception:
        return None, None

def interpolate_across_cliff(dem, cliff_lines, upscale_factor=UPSCALE_FACTOR):
    """
    Perform cliff-aware interpolation using detected cliff lines.
    """
    out_height = dem.shape[0] * upscale_factor
    out_width = dem.shape[1] * upscale_factor
    cliff_mask_hr = np.zeros((out_height, out_width), dtype=bool)
    cliff_params = []

    for cliff_points in cliff_lines:
        tck_result = fit_parametric_curve(cliff_points)
        if tck_result[0] is None:
            continue
        tck, eval_fn = tck_result
        num_hr_points = max(len(cliff_points) * upscale_factor, 100)
        hr_points = eval_fn(num_hr_points)
        hr_points_scaled = np.round(hr_points * upscale_factor).astype(int)
        valid_mask = (hr_points_scaled[:, 0] >= 0) & (hr_points_scaled[:, 0] < out_width) & \
                     (hr_points_scaled[:, 1] >= 0) & (hr_points_scaled[:, 1] < out_height)
        hr_points_scaled = hr_points_scaled[valid_mask]
        if len(hr_points_scaled) < 2:
            continue
        for x, y in hr_points_scaled:
            if 0 <= y < out_height and 0 <= x < out_width:
                cliff_mask_hr[y, x] = True
        perp_samples = sample_perpendicular_to_cliff(dem, cliff_points, tck)
        if perp_samples:
            cliff_params.append((hr_points_scaled, perp_samples, tck))

    x = np.arange(dem.shape[1])
    y = np.arange(dem.shape[0])
    spline = RectBivariateSpline(y, x, dem, kx=3, ky=3)
    new_x = np.linspace(0, dem.shape[1] - 1, out_width)
    new_y = np.linspace(0, dem.shape[0] - 1, out_height)
    interpolated = spline(new_y, new_x)

    if cliff_params:
        influence_map = np.zeros((out_height, out_width), dtype=np.float32)
        for hr_points, perp_samples, tck in cliff_params:
            cliff_influence = create_cliff_influence_map(out_height, out_width, hr_points, perp_samples)
            influence_map += cliff_influence
        interpolated += influence_map
    return interpolated

def sample_perpendicular_to_cliff(dem, cliff_points, tck, sample_distance=5):
    """
    Sample elevation values perpendicular to the cliff line.
    """
    if tck is None or len(cliff_points) < 2:
        return []
    perp_samples = []
    for i in range(len(cliff_points) - 1):
        p1 = cliff_points[i]
        p2 = cliff_points[i + 1]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        perp_dx = -dy
        perp_dy = dx
        length = np.sqrt(perp_dx ** 2 + perp_dy ** 2)
        if length < 0.0001:
            continue
        perp_dx /= length
        perp_dy /= length
        x, y = p1
        x_int, y_int = int(x), int(y)
        if not (0 <= x_int < dem.shape[1] and 0 <= y_int < dem.shape[0]):
            continue
        cliff_elev = dem[y_int, x_int]
        pos_x = x + perp_dx * sample_distance
        pos_y = y + perp_dy * sample_distance
        neg_x = x - perp_dx * sample_distance
        neg_y = y - perp_dy * sample_distance
        pos_x_int, pos_y_int = int(pos_x), int(pos_y)
        neg_x_int, neg_y_int = int(neg_x), int(neg_y)
        pos_valid = (0 <= pos_x_int < dem.shape[1] and 0 <= pos_y_int < dem.shape[0])
        neg_valid = (0 <= neg_x_int < dem.shape[1] and 0 <= neg_y_int < dem.shape[0])
        if pos_valid and neg_valid:
            pos_elev = dem[pos_y_int, pos_x_int]
            neg_elev = dem[neg_y_int, neg_x_int]
            elev_diff = pos_elev - neg_elev
            if abs(elev_diff) >= CLIFF_THRESHOLD * 0.5:
                perp_samples.append({
                    'point': (x, y),
                    'perp_vector': (perp_dx, perp_dy),
                    'pos_elev': pos_elev,
                    'neg_elev': neg_elev,
                    'diff': elev_diff,
                    'cliff_elev': cliff_elev
                })
    return perp_samples

def create_cliff_influence_map(height, width, cliff_points, perp_samples):
    """
    Create an influence map that adjusts elevations around cliff lines.
    """
    influence_map = np.zeros((height, width), dtype=np.float32)
    if not perp_samples:
        return influence_map
    sample_dict = {}
    for sample in perp_samples:
        point = sample['point']
        sample_dict[(int(point[0]), int(point[1]))] = sample
    for i, (x, y) in enumerate(cliff_points):
        if not (0 <= x < width and 0 <= y < height):
            continue
        nearest_sample = None
        min_dist = float('inf')
        for point, sample in sample_dict.items():
            dist = np.sqrt((x / UPSCALE_FACTOR - point[0]) ** 2 + (y / UPSCALE_FACTOR - point[1]) ** 2)
            if dist < min_dist:
                min_dist = dist
                nearest_sample = sample
        if nearest_sample is None:
            continue
        perp_dx, perp_dy = nearest_sample['perp_vector']
        elev_diff = nearest_sample['diff']
        cliff_distance = int(max(5, min(30, abs(elev_diff))) * UPSCALE_FACTOR / 2)
        for dist in range(-cliff_distance, cliff_distance + 1):
            px = int(x + perp_dx * dist)
            py = int(y + perp_dy * dist)
            if not (0 <= px < width and 0 <= py < height):
                continue
            norm_dist = dist / cliff_distance if cliff_distance > 0 else 0
            if abs(norm_dist) < CLIFF_WIDTH_PERCENT / 2:
                factor = (norm_dist + CLIFF_WIDTH_PERCENT / 2) / CLIFF_WIDTH_PERCENT
                adjustment = elev_diff * factor
            elif norm_dist < 0:
                factor = (norm_dist + CLIFF_WIDTH_PERCENT / 2) / SIDE_PERCENT
                adjustment = elev_diff * factor
            else:
                factor = (norm_dist - CLIFF_WIDTH_PERCENT / 2) / SIDE_PERCENT + 1
                adjustment = elev_diff * factor
            weight = 1 - abs(norm_dist)
            influence_map[py, px] += adjustment * weight ** 2
    influence_map = gaussian_filter(influence_map, sigma=SMOOTHING_SIGMA)
    return influence_map

# --------------------
# VISUALIZATION FUNCTIONS
# --------------------
def visualize_results(dem, interpolated, cliff_mask, cliff_lines=None):
    """Visualize the original DEM, cliff edges, and interpolated result."""
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    im1 = axes[0, 0].imshow(dem, cmap='terrain')
    axes[0, 0].set_title('Original DEM')
    plt.colorbar(im1, ax=axes[0, 0])
    axes[0, 1].imshow(cliff_mask, cmap='gray')
    axes[0, 1].set_title('Detected Cliff Edges')
    im3 = axes[1, 0].imshow(dem, cmap='terrain')
    if cliff_lines:
        for points in cliff_lines:
            y_coords = points[:, 1]
            x_coords = points[:, 0]
            axes[1, 0].plot(x_coords, y_coords, 'r-', linewidth=1)
    axes[1, 0].set_title('DEM with Cliff Lines')
    plt.colorbar(im3, ax=axes[1, 0])
    im4 = axes[1, 1].imshow(interpolated, cmap='terrain')
    axes[1, 1].set_title('Cliff-Aware Interpolated DEM')
    plt.colorbar(im4, ax=axes[1, 1])
    plt.tight_layout()
    plt.savefig(OUTPUT_PNG_PATH.replace('.png', '_comparison.png'))
    plt.figure(figsize=(10, 8))
    plt.imshow(interpolated, cmap='terrain')
    plt.title('Cliff-Aware Interpolated DEM')
    plt.colorbar(label='Elevation (m)')
    plt.savefig(OUTPUT_PNG_PATH)

# --------------------
# MAIN PROCESSING FUNCTION
# --------------------
def main():
    try:
        with rasterio.open(DEM_TIF_PATH) as src:
            dem = src.read(1).astype(np.float32)
            dem_transform = src.transform
            crs = src.crs
            dem_width = src.width
            dem_height = src.height
        deg_per_m_lat = 1 / 111000.0
        deg_per_m_lon = 1 / (111320 * math.cos(math.radians(CENTER_LAT)))
        window_deg_lat = WINDOW_SIZE_M * deg_per_m_lat
        window_deg_lon = WINDOW_SIZE_M * deg_per_m_lon
        pixel_size_x = dem_transform.a
        pixel_size_y = abs(dem_transform.e)
        window_pixels_x = int(round(window_deg_lon / pixel_size_x))
        window_pixels_y = int(round(window_deg_lat / pixel_size_y))
        center_row, center_col = rowcol(dem_transform, CENTER_LON, CENTER_LAT)
        half_x = window_pixels_x // 2
        half_y = window_pixels_y // 2
        row_start = max(center_row - half_y, 0)
        row_end = min(center_row + half_y, dem_height)
        col_start = max(center_col - half_x, 0)
        col_end = min(center_col + half_x, dem_width)
        window_dem = dem[row_start:row_end, col_start:col_end]
        window_transform = dem_transform * Affine.translation(col_start, row_start)
        smoothed_dem = gaussian_filter(window_dem, sigma=1.0)
        cliff_mask, gradient_mag = detect_cliff_edges(smoothed_dem, threshold=CLIFF_THRESHOLD)
        cliff_lines = extract_cliff_lines(cliff_mask, smoothed_dem, min_length=CLIFF_MIN_LENGTH,
                                           similarity_threshold=CELL_SIMILARITY_THRESHOLD)
        if len(cliff_lines) == 0:
            x = np.arange(smoothed_dem.shape[1])
            y = np.arange(smoothed_dem.shape[0])
            spline = RectBivariateSpline(y, x, smoothed_dem, kx=3, ky=3)
            outWidth = int(round(smoothed_dem.shape[1] * UPSCALE_FACTOR))
            outHeight = int(round(smoothed_dem.shape[0] * UPSCALE_FACTOR))
            new_x = np.linspace(0, smoothed_dem.shape[1] - 1, outWidth)
            new_y = np.linspace(0, smoothed_dem.shape[0] - 1, outHeight)
            interpolated_dem = spline(new_y, new_x)
        else:
            interpolated_dem = interpolate_across_cliff(smoothed_dem, cliff_lines, upscale_factor=UPSCALE_FACTOR)
        up_transform = window_transform * Affine.scale(1 / UPSCALE_FACTOR, 1 / UPSCALE_FACTOR)
        save_dem_as_tiff(interpolated_dem, up_transform, crs, OUTPUT_TIF_PATH)
        visualize_results(window_dem, interpolated_dem, cliff_mask, cliff_lines)
    except Exception as e:
        x = np.arange(window_dem.shape[1])
        y = np.arange(window_dem.shape[0])
        spline = RectBivariateSpline(y, x, window_dem, kx=3, ky=3)
        outWidth = int(round(window_dem.shape[1] * UPSCALE_FACTOR))
        outHeight = int(round(window_dem.shape[0] * UPSCALE_FACTOR))
        new_x = np.linspace(0, window_dem.shape[1] - 1, outWidth)
        new_y = np.linspace(0, window_dem.shape[0] - 1, outHeight)
        interpolated_dem = spline(new_y, new_x)
        up_transform = window_transform * Affine.scale(1 / UPSCALE_FACTOR, 1 / UPSCALE_FACTOR)
        save_dem_as_tiff(interpolated_dem, up_transform, crs, OUTPUT_TIF_PATH)
        plt.figure(figsize=(10, 8))
        plt.imshow(interpolated_dem, cmap='terrain')
        plt.title('Standard Bicubic Interpolation (Fallback)')
        plt.colorbar(label='Elevation (m)')
        plt.savefig(OUTPUT_PNG_PATH)

if __name__ == "__main__":
    main()
