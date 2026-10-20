#!/usr/bin/env python3
"""Run installed Constrain/PACT offline gates against this isolated contract.

This is structural/source-evidence validation. Execute Node's sandbox tests
separately for behavioral acceptance. No provider/backend pipeline is invoked.
"""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / 'contracts/privacy_sandbox/interface.json'
REGISTER = ROOT / '.constrain/artifacts/boundary_register.yaml'

def invoke(command, cwd, expect_failure=False):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    print('$ ' + ' '.join(map(str, command)), flush=True)
    print((result.stdout + result.stderr).strip(), flush=True)
    if expect_failure:
        if result.returncode == 0:
            raise RuntimeError('Negative control was incorrectly accepted')
        print('Negative control rejected as required.', flush=True)
    elif result.returncode:
        raise RuntimeError(f'Validation failed with exit {result.returncode}')

def main():
    tools = {name: shutil.which(name) for name in ('constrain', 'pact', 'node')}
    if not all(tools.values()):
        raise RuntimeError('Requires installed constrain, pact, and node; no packages are installed automatically')
    data = json.loads(CONTRACT.read_text())
    suite = json.loads((ROOT/'contracts/privacy_sandbox/test_suite.json').read_text())
    functions = {function['name'] for function in data['functions']}
    for case in suite['test_cases']:
        source = ROOT / case['setup_description']
        titles = re.findall(r"^test\('([^']+)'", source.read_text(), re.M)
        if case['description'] not in titles or case['function'] not in functions:
            raise RuntimeError('Test metadata does not match an executable test and contract function: '+case['id'])
    # Preserve existing project decomposition and historical pipeline settings.
    # The isolated tree validates only this sandbox reference component.
    with tempfile.TemporaryDirectory(prefix='hp2p-contract-validation-') as name:
        stage = Path(name)
        sources = {rec['path'] for entry in data['boundary_identifiers'] for side in entry['sides'] for rec in side['records']}
        javascript_sources = sorted(str(p.relative_to(ROOT)) for pattern in ('sandbox/*.js', 'tests/sandbox*.test.js') for p in ROOT.glob(pattern))
        sources.update(javascript_sources)
        for relative in sources:
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        (stage/'contracts/privacy_sandbox').mkdir(parents=True, exist_ok=True)
        (stage/'tests/privacy_sandbox').mkdir(parents=True)
        (stage/'decomposition').mkdir()
        shutil.copyfile(CONTRACT, stage/'contracts/privacy_sandbox/interface.json')
        shutil.copyfile(ROOT/'contracts/privacy_sandbox/test_suite.json', stage/'tests/privacy_sandbox/contract_test_suite.json')
        (stage/'decomposition/tree.json').write_text(json.dumps({'root_id':'privacy_sandbox','nodes':{'privacy_sandbox':{'component_id':'privacy_sandbox','name':data['name'],'description':data['description'],'children':[]}}}))
        shutil.copytree(ROOT/'.constrain', stage/'.constrain')
        for source in javascript_sources:
            invoke([tools['node'],'--check',source], stage)
        invoke([tools['constrain'],'validate'], stage)
        invoke([tools['constrain'],'boundary','verify','.constrain/artifacts/boundary_register.yaml','--root','.'], stage)
        invoke([tools['pact'],'validate','.'], stage)
        invoke([tools['pact'],'boundary','verify','.'], stage)
        source = stage/'sandbox/credits.js'
        original = source.read_bytes()
        source.write_bytes(original+b'\n// negative-control: source changed after citation\n')
        invoke([tools['constrain'],'boundary','verify','.constrain/artifacts/boundary_register.yaml','--root','.'], stage, True)
        invoke([tools['pact'],'boundary','verify','.'], stage, True)
        source.write_bytes(original)
        bad = json.loads(json.dumps(data))
        bad['functions'][0]['output_type']='UndefinedDummyReceipt'
        (stage/'contracts/privacy_sandbox/interface.json').write_text(json.dumps(bad))
        invoke([tools['pact'],'validate','.'], stage, True)
    print('PASS: Constrain/PACT structural gates and three negative controls. No provider calls; behavioral tests remain a separate gate.')

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
