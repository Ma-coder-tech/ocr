"""JSON record boundary for the frozen structural classifier.

Printed page pairs are tuples internally and arrays in JSON. Normalize the
recomputed result through the same wire representation before comparison.
This changes no structural decisions or frozen classifier code.
"""
import json
from structure import assemble

def json_value(value):
    return json.loads(json.dumps(value,allow_nan=False))

def validate_record(packet, saved_json_value, independent_inventory):
    return saved_json_value == json_value(assemble(packet,independent_inventory))
