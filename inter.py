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

# Cliff detection parameters (used only for line extraction/overlay)
CLIFF_THRESHOLD = 12.0  # Minimum elevation change (meters)
CLIFF_MIN_LENGTH = 5  # Minimum length of a cliff in pixels (filter out noise)
CLIFF_WIDTH_PERCENT = 0.2  # Percentage of elevation change attributed to cliff (20%)
SIDE_PERCENT = 0.4  # Percentage on either side (40%)
SMOOTHING_SIGMA = 1.0  # Gaussian smoothing parameter
CELL_SIMILARITY_THRESHOLD = 10  # Maximum allowed difference between adjacent cells

# Post-smoothing parameter for the final interpolated DEM
POST_SMOOTHING_SIGMA = 1.0

# Parameters for ratio-based shifting in edge detection
EPS = 1e-6
alpha = 0.3

# Parameters for generating perpendiculars:
SEGMENT_LENGTH = 3  # Total length (in pixels) of each perpendicular segment.
SAMPLE_INTERVAL = 5  # Sample every 5 points along the smoothed curve.


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


def detect_cliff_edges(dem, threshold=CLIFF_THRESHOLD):
    """
    Detect cliff edges manually by computing the gradient magnitude using finite differences.
    Computes horizontal and vertical ratios (0 to 1) that incorporate diagonal values (with reduced weight).
    Returns a binary cliff mask, the gradient magnitude, and the two ratio arrays.
    """
    rows, cols = dem.shape
    magnitude = np.zeros_like(dem)
    position_horiz = np.zeros_like(dem)
    position_vert = np.zeros_like(dem)
    norm_factor = np.sqrt(2)
    for row in range(1, rows - 1):
        for col in range(1, cols - 1):
            center_pixel = dem[row, col]
            grad_x_left = abs(center_pixel - dem[row, col - 1])
            grad_x_right = abs(center_pixel - dem[row, col + 1])
            grad_y_top = abs(center_pixel - dem[row - 1, col])
            grad_y_bottom = abs(center_pixel - dem[row + 1, col])
            grad_diag_tl = abs(center_pixel - dem[row - 1, col - 1]) / norm_factor
            grad_diag_tr = abs(center_pixel - dem[row - 1, col + 1]) / norm_factor
            grad_diag_bl = abs(center_pixel - dem[row + 1, col - 1]) / norm_factor
            grad_diag_br = abs(center_pixel - dem[row + 1, col + 1]) / norm_factor

            local_max_grad = max(grad_x_left, grad_x_right, grad_y_top, grad_y_bottom,
                                 grad_diag_tl, grad_diag_tr, grad_diag_bl, grad_diag_br)
            magnitude[row, col] = local_max_grad

            # Horizontal ratio: 0 means gradient mainly from left; 1 means from right.
            horiz_numer = grad_x_right + alpha * (grad_diag_tr + grad_diag_br)
            horiz_denom = grad_x_left + grad_x_right + alpha * (
                        grad_diag_tl + grad_diag_bl + grad_diag_tr + grad_diag_br) + EPS
            position_horiz[row, col] = horiz_numer / horiz_denom

            # Vertical ratio: 0 means gradient mainly from top; 1 means from bottom.
            vert_numer = grad_y_bottom + alpha * (grad_diag_bl + grad_diag_br)
            vert_denom = grad_y_top + grad_y_bottom + alpha * (
                        grad_diag_tl + grad_diag_tr + grad_diag_bl + grad_diag_br) + EPS
            position_vert[row, col] = vert_numer / vert_denom

    cliff_mask = magnitude > threshold
    return cliff_mask, magnitude, position_horiz, position_vert


def extract_cliff_lines(cliff_mask, dem, position_horiz, position_vert, min_length=CLIFF_MIN_LENGTH,
                        similarity_threshold=CELL_SIMILARITY_THRESHOLD):
    print("Extracting cliff lines")
    try:
        cliff_mask_uint8 = cliff_mask.astype(np.uint8) * 255
        contours, _ = cv2.findContours(cliff_mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cliff_lines = []
        for contour in contours:
            if len(contour) < min_length:
                continue
            segments = []
            # Convert first point to float.
            current_segment = [contour[0][0].astype(np.float32)]
            for pt_arr in contour[1:]:
                pt = pt_arr[0].astype(np.float32)
                current_val = dem[int(pt[1]), int(pt[0])]
                prev_pt = current_segment[-1]
                prev_val = dem[int(prev_pt[1]), int(prev_pt[0])]
                if abs(current_val - prev_val) <= similarity_threshold:
                    current_segment.append(pt)
                else:
                    if len(current_segment) >= min_length:
                        segments.append(np.array(current_segment, dtype=np.float32))
                    current_segment = [pt]
            if len(current_segment) >= min_length:
                segments.append(np.array(current_segment, dtype=np.float32))
            cliff_lines.extend(segments)

        # For each cliff line, adjust the points based on position_horiz and position_vert.
        for i, points in enumerate(cliff_lines):
            for j in range(len(points)):
                # Points are stored as (x, y) floats.
                col, row = points[j]  # (x, y)
                row_idx = int(round(row))
                col_idx = int(round(col))
                row_idx = np.clip(row_idx, 0, dem.shape[0] - 1)
                col_idx = np.clip(col_idx, 0, dem.shape[1] - 1)
                horiz_ratio = position_horiz[row_idx, col_idx]
                vert_ratio = position_vert[row_idx, col_idx]
                new_col = col + horiz_ratio
                new_row = row + vert_ratio
                points[j] = (new_col, new_row)
                print(new_col, new_row)
                print(points[j])
        print("Before")
        print(f"Extracted {len(cliff_lines)} cliff lines.")
        return cliff_lines
    except Exception as e:
        import traceback
        print("Exception in extract_cliff_lines:", e)
        print(traceback.format_exc())
        raise


def fit_parametric_curve(points, smoothness=0.8):
    """
    Fit a parametric spline to a set of points.
    Returns the spline parameters and an evaluation function.
    """
    if len(points) < 4:
        return None, None
    points = np.array(points, dtype=np.float32)
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
    except Exception as e:
        print("Exception in fit_parametric_curve:", e)
        return None, None


def smooth_cliff_line(points, smoothness=0.8, num_points=200):
    """
    Smooth a raw cliff line into a curve using a parametric spline.
    Returns an array of points representing the smoothed curve.
    If spline fitting fails, returns the original points.
    """
    tck, eval_fn = fit_parametric_curve(points, smoothness=smoothness)
    if tck is None:
        return points
    return eval_fn(num_points)


def generate_perpendiculars(curve, segment_length=SEGMENT_LENGTH, sample_interval=SAMPLE_INTERVAL):
    """
    For a given smoothed cliff curve (Nx2 float array), generate a list of perpendicular line segments.
    For each sample point along the curve (sampled every sample_interval points), compute the unit normal,
    then generate a perpendicular segment of total length segment_length (centered at the point).

    Returns a list of tuples (p_left, p_right) where each is an endpoint of the perpendicular segment.
    """
    curve = np.array(curve, dtype=np.float32)
    if len(curve) < 2:
        return []
    # Compute differences (tangent approximations)
    diffs = np.diff(curve, axis=0)
    # Compute unit tangent vectors
    tangents = diffs / (np.linalg.norm(diffs, axis=1, keepdims=True) + 1e-6)
    # For interior points, average adjacent tangents; use first and last for endpoints.
    tangents_full = np.zeros_like(curve)
    tangents_full[0] = tangents[0]
    tangents_full[-1] = tangents[-1]
    for i in range(1, len(curve) - 1):
        avg_tangent = (tangents[i - 1] + tangents[i]) / 2.0
        tangents_full[i] = avg_tangent / (np.linalg.norm(avg_tangent) + 1e-6)
    # Compute normals (rotate tangents 90° counterclockwise)
    normals = np.zeros_like(tangents_full)
    normals[:, 0] = -tangents_full[:, 1]
    normals[:, 1] = tangents_full[:, 0]

    segments = []
    for i in range(0, len(curve), sample_interval):
        point = curve[i]
        normal = normals[i]
        # Compute endpoints: segment is centered at the point.
        p_left = point - (segment_length / 2) * normal
        p_right = point + (segment_length / 2) * normal
        segments.append((p_left, p_right))
    return segments


# --------------------
# VISUALIZATION FUNCTIONS
# --------------------
def visualize_results(dem, interpolated, cliff_mask, cliff_lines=None,
                      band_mask=None, region_img=None):
    """
    2×3 comparison:
      Row1: [DEM w/ raw cliff lines] [Bicubic DEM] [Final masked DEM]
      Row2: [Mapped Regions Overlay] [Cliff‑aware blend] [Final Result]
    """
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # ── Row 1, Col 0: DEM with raw (unrounded) cliff lines ──
    im00 = axes[0,0].imshow(dem, cmap='terrain')
    if cliff_lines:
        for pts in cliff_lines:
            axes[0,0].plot(pts[:,0], pts[:,1], 'r-', linewidth=0.5)
    axes[0,0].set_title('DEM with Raw Cliff Lines')
    plt.colorbar(im00, ax=axes[0,0])

    # ── Row 1, Col 1: Bicubic Interpolated DEM ──
    im01 = axes[0,1].imshow(interpolated, cmap='terrain')
    axes[0,1].set_title('Bicubic Interpolated DEM')
    plt.colorbar(im01, ax=axes[0,1])

    # ── Row 1, Col 2: Final Masked DEM (band only) ──
    final_masked = np.full_like(interpolated, np.nan)
    if band_mask is not None:
        final_masked[band_mask==1] = interpolated[band_mask==1]
    im02 = axes[0,2].imshow(final_masked, cmap='terrain')
    axes[0,2].set_title('Final DEM (band only)')
    plt.colorbar(im02, ax=axes[0,2])

    # ── Row 2, Col 0: Mapped Regions Overlay ──
    im10 = axes[1,0].imshow(interpolated, cmap='terrain')
    if region_img is not None:
        axes[1,0].imshow(region_img, alpha=0.5)
    axes[1,0].set_title('Mapped Regions Overlay')
    plt.colorbar(im10, ax=axes[1,0])

    # ── Row 2, Col 1: Cliff‑Aware Adjusted Interpolated ──
    im11 = axes[1,1].imshow(interpolated, cmap='terrain')
    if cliff_lines and band_mask is not None:
        axes[1,1].imshow(band_mask, cmap='Reds', alpha=0.3)
    axes[1,1].set_title('Cliff‑Aware Adjusted')
    plt.colorbar(im11, ax=axes[1,1])

    # ── Row 2, Col 2: Final Result ──
    im12 = axes[1,2].imshow(interpolated, cmap='terrain')
    axes[1,2].set_title('Final Result')
    plt.colorbar(im12, ax=axes[1,2])

    plt.tight_layout()
    plt.savefig(OUTPUT_PNG_PATH.replace('.png','_comparison.png'))


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

        # Define window in degrees based on center point and window size in meters.
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

        # Smooth the DEM for processing.
        smoothed_dem = gaussian_filter(window_dem, sigma=1.0)

        # Detect cliff edges and extract cliff lines (for overlay only).
        cliff_mask, gradient_mag, position_horiz, position_vert = detect_cliff_edges(smoothed_dem,
                                                                                     threshold=CLIFF_THRESHOLD)
        print(f"Detected {np.sum(cliff_mask)} cliff pixels.")
        cliff_lines = extract_cliff_lines(cliff_mask, smoothed_dem, position_horiz, position_vert,
                                          min_length=CLIFF_MIN_LENGTH,
                                          similarity_threshold=CELL_SIMILARITY_THRESHOLD)

        # Perform standard bicubic interpolation (ignoring cliff lines for interpolation).
        x = np.arange(smoothed_dem.shape[1])
        y = np.arange(smoothed_dem.shape[0])
        spline = RectBivariateSpline(y, x, smoothed_dem, kx=3, ky=3)
        outWidth = int(round(smoothed_dem.shape[1] * UPSCALE_FACTOR))
        outHeight = int(round(smoothed_dem.shape[0] * UPSCALE_FACTOR))
        new_x = np.linspace(0, smoothed_dem.shape[1] - 1, outWidth)
        new_y = np.linspace(0, smoothed_dem.shape[0] - 1, outHeight)
        interpolated_dem = spline(new_y, new_x)

        # Optional post-smoothing for a more rounded look.
        # Optional post-smoothing for a more rounded look.
        interpolated_dem = gaussian_filter(interpolated_dem, sigma=POST_SMOOTHING_SIGMA)

        # — Build the high‑res “perpendicular band” mask —
        band_mask_hr = np.zeros_like(interpolated_dem, dtype=np.uint8)
        for pts in cliff_lines:
            smooth_pts = smooth_cliff_line(pts)
            perp_segs = generate_perpendiculars(
                smooth_pts,
                segment_length=SEGMENT_LENGTH,
                sample_interval=SAMPLE_INTERVAL
            )
            for p_left, p_right in perp_segs:
                x1 = int(round(p_left[0] * UPSCALE_FACTOR))
                y1 = int(round(p_left[1] * UPSCALE_FACTOR))
                x2 = int(round(p_right[0] * UPSCALE_FACTOR))
                y2 = int(round(p_right[1] * UPSCALE_FACTOR))
                cv2.line(band_mask_hr, (x1, y1), (x2, y2), color=1, thickness=1)
        # Dilate so the band is continuous
        kernel = np.ones((3, 3), np.uint8)
        band_mask_hr = cv2.dilate(band_mask_hr, kernel, iterations=1)

        # --- 1) build high-res cliff-line mask ---
        mask_line_hr = np.zeros_like(band_mask_hr, dtype=np.uint8)
        for pts in cliff_lines:
            smooth_pts = smooth_cliff_line(pts)
            up_pts = np.round(smooth_pts * UPSCALE_FACTOR).astype(np.int32)
            cv2.polylines(mask_line_hr, [up_pts], isClosed=False, color=1, thickness=1)
        kernel = np.ones((3, 3), np.uint8)

        # --- 2) extract cliff vs non-cliff points ---
        ys_line, xs_line = np.where(mask_line_hr == 1)
        cliff_points = np.column_stack((xs_line, ys_line))  # shape (N_cliff, 2)

        ys_band, xs_band = np.where((band_mask_hr == 1) & (mask_line_hr == 0))
        non_cliff_points = np.column_stack((xs_band, ys_band))  # shape (N_noncliff, 2)

        # --- 3) prepare all perp segments with their center points ---
        perp_list_by_line = []
        for pts in cliff_lines:
            smooth_pts = smooth_cliff_line(pts)
            perp_segs = generate_perpendiculars(smooth_pts)
            centers = smooth_pts[::SAMPLE_INTERVAL]
            triples = []
            for ctr, (pl, pr) in zip(centers, perp_segs):
                ctr_hr = tuple((ctr * UPSCALE_FACTOR).astype(int).tolist())
                left_hr = tuple((pl * UPSCALE_FACTOR).astype(int).tolist())
                right_hr = tuple((pr * UPSCALE_FACTOR).astype(int).tolist())
                triples.append((ctr_hr, left_hr, right_hr))
            perp_list_by_line.append(triples)

        # --- helper: distance from point to a segment AB ---
        def point_to_segment_dist(pt, A, B):
            pt = np.array(pt, float)
            A, B = np.array(A, float), np.array(B, float)
            AB = B - A
            t = np.dot(pt - A, AB) / (np.dot(AB, AB) + 1e-6)
            t = np.clip(t, 0, 1)
            closest = A + t * AB
            return np.linalg.norm(pt - closest)

        # --- 4) build mapping: center -> list of non_cliff points ---
        mapping = {}  # maps center_hr → list of pixel coords

        for p in map(tuple, non_cliff_points):
            # — a) find closest line —
            best_line_idx, best_line_dist = None, float('inf')
            for li, triples in enumerate(perp_list_by_line):
                # approximate line‑distance by min dist to that line’s center points
                for ctr_hr, _, _ in triples:
                    d = np.hypot(p[0] - ctr_hr[0], p[1] - ctr_hr[1])
                    if d < best_line_dist:
                        best_line_dist, best_line_idx = d, li

            # — b) within that line, find closest perp segment —
            best_ctr, best_seg_dist = None, float('inf')
            for ctr_hr, A, B in perp_list_by_line[best_line_idx]:
                d = point_to_segment_dist(p, A, B)
                if d < best_seg_dist:
                    best_seg_dist, best_ctr = d, ctr_hr

            mapping.setdefault(best_ctr, []).append(p)

        # now:
        # - `cliff_points` is your array of all pixels on the cliff lines
        # - `non_cliff_points` is your array of band pixels off the cliff
        # - `mapping` maps each cliff-center point `ctr` → its assigned list of non-cliff points

        band_index = {}  # map center‐pixel → band index

        for triples in perp_list_by_line:
            n = len(triples)
            for i, (ctr_hr, left_hr, right_hr) in enumerate(triples):
                # at i=0 (first perp) → band 0
                # at i=1 → band 1
                # …
                # at i=n-1 (last perp) → band 0 again
                idx = min(i, n - 1 - i)
                band_index[ctr_hr] = idx

        # 0) build a quick lookup of each center → its perp endpoints (high-res ints)
        seg_dict = {}
        for triples in perp_list_by_line:
            for ctr_hr, left_hr, right_hr in triples:
                seg_dict[ctr_hr] = (np.array(left_hr, float),
                                    np.array(right_hr, float))

        # 1) clear out old mask
        # --- reset mask and prepare delete‐list ---
        band_mask_hr[:] = 0
        to_delete = []  # collect (x,y) to delete from interpolated_dem

        for ctr, pts in mapping.items():
            bi = band_index[ctr]
            # pick transform_pct
            if bi == 0:
                transform_pct = 0.95
            elif 0 < bi < 5:
                transform_pct = 1.0 - bi * 0.1
            else:
                transform_pct = 0.5

            # get the perp‐direction unit vector
            A, B = seg_dict[ctr]
            u = (B - A) / (np.linalg.norm(B - A) + 1e-6)

            # split into two sides
            side_pos, side_neg = [], []
            for x, y in pts:
                vec = np.array([x, y]) - np.array(ctr)
                (side_pos if vec.dot(u) >= 0 else side_neg).append((x, y))

            # process each side independently
            for side in (side_pos, side_neg):
                if not side:
                    continue

                # 1) find furthest point & its x,y offset
                max_dist = 0
                furthest = None
                for x, y in side:
                    d = np.hypot(x - ctr[0], y - ctr[1])
                    if d > max_dist:
                        max_dist, furthest = d, (x, y)
                dx_max = furthest[0] - ctr[0]
                dy_max = furthest[1] - ctr[1]
                # (you can now log or store dx_max,dy_max for each side if you like)

                # 2) keep only those beyond transform_pct*max_dist
                thresh = (1 - transform_pct) * max_dist
                for x, y in side:
                    if np.hypot(x - ctr[0], y - ctr[1]) <= thresh:
                        band_mask_hr[y, x] = 1
                        to_delete.append((x, y))

        # 3) physically delete them from the DEM
        for x, y in to_delete:
            interpolated_dem[y, x] = np.nan  # or whatever “no‐data” you prefer

        import random
        h, w = band_mask_hr.shape
        region_img = np.zeros((h, w, 3), dtype=np.uint8)
        colors = {ctr: (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
                  for ctr in mapping}
        for ctr, pts in mapping.items():
            color = colors[ctr]
            for x, y in pts:
                region_img[y, x] = color
        # also color the cliff line itself in white
        for x, y in cliff_points:
            region_img[y, x] = (255, 255, 255)

        up_transform = window_transform * Affine.scale(1 / UPSCALE_FACTOR, 1 / UPSCALE_FACTOR)
        save_dem_as_tiff(interpolated_dem, up_transform, crs, OUTPUT_TIF_PATH)
        visualize_results(window_dem, interpolated_dem, cliff_mask, cliff_lines, band_mask_hr, region_img)
    except Exception as e:
        print("Exception in main:", e)
        # Fallback: standard bicubic interpolation with post-smoothing.
        x = np.arange(window_dem.shape[1])
        y = np.arange(window_dem.shape[0])
        spline = RectBivariateSpline(y, x, window_dem, kx=3, ky=3)
        outWidth = int(round(window_dem.shape[1] * UPSCALE_FACTOR))
        outHeight = int(round(window_dem.shape[0] * UPSCALE_FACTOR))
        new_x = np.linspace(0, window_dem.shape[1] - 1, outWidth)
        new_y = np.linspace(0, window_dem.shape[0] - 1, outHeight)
        interpolated_dem = spline(new_y, new_x)
        interpolated_dem = gaussian_filter(interpolated_dem, sigma=POST_SMOOTHING_SIGMA)
        up_transform = window_transform * Affine.scale(1 / UPSCALE_FACTOR, 1 / UPSCALE_FACTOR)
        save_dem_as_tiff(interpolated_dem, up_transform, crs, OUTPUT_TIF_PATH)
        plt.figure(figsize=(10, 8))
        plt.imshow(interpolated_dem, cmap='terrain')
        plt.title('Standard Bicubic Interpolation (Fallback)')
        plt.colorbar(label='Elevation (m)')
        plt.savefig(OUTPUT_PNG_PATH)


if __name__ == "__main__":
    main()
