Place exported models for the 3D viewer in this directory.

- Expected default file: so-101.glb (gltf binary)
- Units: millimetres (scale factor can be adjusted in ArmViewer props)
- Each moving link should have its pivot aligned to the servo axis.
- Name nodes to match joint IDs (defaults: joint_base, joint_shoulder, joint_elbow, joint_wrist_roll, joint_wrist_pitch, joint_gripper)

The viewer falls back to a procedural placeholder if the model file is missing.




Im Auslieferungszustand hat jeder Servo beim Initial-Setup die ID 1. Werden mehrere Servos mit derselben ID gleichzeitig angeschlossen, kommt es zu Adresskonflikten: Die Software findet keine Geräte bzw. meldet Fehler. Deshalb wurden im Tutorial die Servo-IDs zuerst geändert, bevor alle gemeinsam angeschlossen wurden.