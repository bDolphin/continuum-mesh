#!/usr/bin/env python3
"""
Generate Context Mesh extension icons
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    """Create a brain/memory icon with gradient background"""
    
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background circle
    center = size // 2
    radius = int(size * 0.45)
    
    # Create gradient effect with multiple circles
    for i in range(radius, 0, -1):
        # Purple to cyan gradient
        ratio = i / radius
        r = int(102 + (118 - 102) * (1 - ratio))
        g = int(126 + (186 - 126) * (1 - ratio))
        b = int(234 + (162 - 234) * (1 - ratio))
        alpha = int(255 * 0.95)
        
        draw.ellipse(
            [center - i, center - i, center + i, center + i],
            fill=(r, g, b, alpha)
        )
    
    # Draw brain/network icon in white
    icon_color = (255, 255, 255, 255)
    line_width = max(2, size // 32)
    
    # Draw simplified brain/network nodes
    node_radius = size // 16
    nodes = [
        (center - size//6, center - size//8),  # Top left
        (center + size//6, center - size//8),  # Top right
        (center, center),                       # Center
        (center - size//6, center + size//8),  # Bottom left
        (center + size//6, center + size//8),  # Bottom right
    ]
    
    # Draw connections
    connections = [
        (0, 2), (1, 2), (2, 3), (2, 4),  # Star pattern from center
        (0, 3), (1, 4)  # Side connections
    ]
    
    for start, end in connections:
        draw.line(
            [nodes[start], nodes[end]],
            fill=icon_color,
            width=line_width
        )
    
    # Draw nodes
    for x, y in nodes:
        draw.ellipse(
            [x - node_radius, y - node_radius, x + node_radius, y + node_radius],
            fill=icon_color,
            outline=icon_color
        )
    
    # Save
    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

# Create icons directory if it doesn't exist
icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(icons_dir, exist_ok=True)

# Generate all required sizes
create_icon(16, os.path.join(icons_dir, 'icon16.png'))
create_icon(48, os.path.join(icons_dir, 'icon48.png'))
create_icon(128, os.path.join(icons_dir, 'icon128.png'))

print("\n✅ All icons created successfully!")
print("Reload the extension in chrome://extensions/ to see the new icons.")
