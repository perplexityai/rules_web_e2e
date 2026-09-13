"""Package the fixture's uncompressed runtime tar as a single-layer OCI image."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

archive, output = map(Path, sys.argv[1:])
blobs = output / "blobs/sha256"
blobs.mkdir(parents=True)
with archive.open("rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
shutil.copyfile(archive, blobs / digest)
layer = {"digest": "sha256:" + digest, "size": archive.stat().st_size,
         "mediaType": "application/vnd.oci.image.layer.v1.tar"}


def put(value, media):
    data = json.dumps(value, sort_keys=True).encode()
    digest = hashlib.sha256(data).hexdigest()
    (blobs / digest).write_bytes(data)
    return {"digest": "sha256:" + digest, "size": len(data), "mediaType": media}


config = put({"os": "linux", "architecture": "amd64",
              "rootfs": {"type": "layers", "diff_ids": [layer["digest"]]}},
             "application/vnd.oci.image.config.v1+json")
manifest = put({"schemaVersion": 2, "config": config, "layers": [layer]},
               "application/vnd.oci.image.manifest.v1+json")
(output / "oci-layout").write_text('{"imageLayoutVersion":"1.0.0"}')
(output / "index.json").write_text(json.dumps({"schemaVersion": 2, "manifests": [manifest]}))
