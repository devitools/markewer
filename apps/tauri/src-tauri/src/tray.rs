use std::sync::atomic::Ordering;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn create_tray_icon() -> (Vec<u8>, u32, u32) {
    let size: u32 = 36;
    let mut pixels = vec![0u8; (size * size * 4) as usize];
    let s = size as f32;

    for y in 0..size {
        for x in 0..size {
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;

            let nx = fx / s;
            let ny = fy / s;

            let alpha = glyph_a(nx, ny, s);

            let idx = ((y * size + x) * 4) as usize;
            pixels[idx] = 0;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = (alpha * 255.0).clamp(0.0, 255.0) as u8;
        }
    }

    (pixels, size, size)
}

fn glyph_a(nx: f32, ny: f32, size: f32) -> f32 {
    let cx = 0.5;
    let aa = 1.5 / size;

    let top = 0.14;
    let bottom = 0.88;
    let height = bottom - top;

    if ny < top - aa || ny > bottom + aa {
        return 0.0;
    }

    let stroke = 0.115; // Slightly thinner stroke for sharper look

    // Left leg: from apex to bottom-left
    let left_top_x = cx;
    let left_bot_x: f32 = 0.15;
    let t = ((ny - top) / height).clamp(0.0, 1.0);
    let left_center = left_top_x + (left_bot_x - left_top_x) * t;

    let d_left = (nx - left_center).abs() - stroke / 2.0;
    let a_left = smoothstep(aa, -aa, d_left);

    // Right leg: from apex to bottom-right
    let right_bot_x: f32 = 0.85;
    let right_center = left_top_x + (right_bot_x - left_top_x) * t;

    let d_right = (nx - right_center).abs() - stroke / 2.0;
    let a_right = smoothstep(aa, -aa, d_right);

    // Diamond/Losango in the middle instead of crossbar
    let diamond_cy = 0.55; // Center Y of diamond
    let diamond_size = 0.12; // Size of diamond

    // Rotated square (diamond) using Manhattan distance
    let dx = (nx - cx).abs();
    let dy = (ny - diamond_cy).abs();
    let diamond_d = dx + dy - diamond_size;
    let a_diamond = smoothstep(aa, -aa, diamond_d);

    // Sharp apex - very small cap at the top
    let apex_d = ((nx - cx).powi(2) + (ny - top).powi(2)).sqrt();
    let a_apex = smoothstep(stroke / 4.0 + aa, stroke / 4.0 - aa, apex_d);

    let mut alpha = a_left.max(a_right).max(a_diamond).max(a_apex);

    // Clip top and bottom with smooth edges
    alpha *= smoothstep(top - aa, top + aa, ny);
    alpha *= smoothstep(bottom + aa, bottom - aa, ny);

    alpha.clamp(0.0, 1.0)
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        eprintln!("Warning: main window not found");
    }
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app).item(&show).separator().item(&quit).build()?;

    let (icon_data, w, h) = create_tray_icon();
    let icon = Image::new_owned(icon_data, w, h);

    let mut builder = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                show_main_window(app);
            }
            "quit" => {
                if let Some(state) = app.try_state::<crate::ExplicitQuit>() {
                    state.0.store(true, Ordering::Relaxed);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    builder.build(app)?;

    Ok(())
}
