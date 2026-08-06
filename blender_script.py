
import bpy
import os

filepath_in = r"d:/Akashatech/ar-mvp/public/models/spaceship.glb"
filepath_out = r"d:/Akashatech/ar-mvp/public/models/spaceship-collider.glb"

# Clear all existing objects
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the GLB
print("Importing...", flush=True)
bpy.ops.import_scene.gltf(filepath=filepath_in)

# Find meshes to delete and meshes to decimate
objects_to_delete = []
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        name_lower = obj.name.lower()
        
        is_niche = "room" in name_lower and "main" not in name_lower
        is_door = "door" in name_lower or "gate" in name_lower or "glass" in name_lower
        
        if is_niche or is_door:
            objects_to_delete.append(obj)
        else:
            # Optional: Apply decimate modifier if you want, but skipping to prevent timeouts
            pass

# Delete unwanted objects
bpy.ops.object.select_all(action="DESELECT")
for obj in objects_to_delete:
    obj.select_set(True)
bpy.ops.object.delete()

# Ensure there is an active object for the exporter
if len(bpy.context.scene.objects) > 0:
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]

print("Exporting...", flush=True)
# Export
bpy.ops.export_scene.gltf(filepath=filepath_out, export_format="GLB")
print("Successfully generated decimated collider", flush=True)
