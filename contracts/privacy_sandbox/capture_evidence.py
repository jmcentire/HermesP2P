#!/usr/bin/env python3
"""Explicitly refresh source citations and authored Constrain session; makes no provider calls."""
from pathlib import Path
import json,re,hashlib
import yaml
from pact.schemas import ComponentContract, ContractTestSuite
from constrain.models import Session,Phase,Posture,BoundaryRegister
import argparse
parser=argparse.ArgumentParser(description='Re-capture sandbox boundary evidence only after reviewing changed source.')
parser.add_argument('--reviewed-source-change', action='store_true', required=True, help='Confirm the cited source changes have been reviewed before accepting new hashes.')
parser.parse_args()
root=Path(__file__).resolve().parents[2]
def record(path,value):
 raw=(root/path).read_bytes(); text=raw.decode()
 from constrain.boundary import token_lines
 lines=token_lines(text,value)
 if not lines: raise ValueError((path,value))
 return {'kind':'file','path':path,'line':lines[0],'sha256':hashlib.sha256(raw).hexdigest()}
def side(party,role,path,value):
 return {'party':party,'role':role,'value':value,'records':[record(path,value)]}
entries=[]
for value in ['ordinary','advertising','offerHash','challenge','evidenceHash','requirementsHash','expiresAt']:
 entries.append({'id':'credits.'+value,'kind':'enum' if value in ['ordinary','advertising'] else 'field','relation':'equal','description':'Exact '+value+' identifier across dummy credit requirements, implementation and adversarial tests.','sides':[side('external:specification','defines','contracts/privacy_sandbox/requirements.json',value),side('privacy_sandbox','consumes','sandbox/credits.js',value),side('external:sandbox_tests','consumes','tests/sandbox-credits.test.js',value)]})
value='hp2p.sandbox.subscription.publisher.v1'
entries.append({'id':'subscription.publisher-domain','kind':'claim','relation':'equal','description':'Publisher signature domain must match the explicit subscription specification.','sides':[side('external:specification','defines','contracts/privacy_sandbox/requirements.json',value),side('privacy_sandbox','consumes','sandbox/subscriptions.js',value)]})
for value in ['FEE_BASIS_POINTS','negotiationWindow','MonthlySymmetricChannel','readPublisherMessage','sealPublisherMessage','openPublisherMessage']:
 file='credits' if value=='FEE_BASIS_POINTS' else 'subscriptions'
 entries.append({'id':'interface.'+value,'kind':'name','relation':'equal','description':'Exact exported interface used by the executable sandbox tests.','sides':[side('privacy_sandbox','defines',f'sandbox/{file}.js',value),side('external:sandbox_tests','consumes',f'tests/sandbox-{file}.test.js',value)]})
for value in ['CAMPAIGN_DOMAIN','receivePromise','settlePromise','redeemSuperlike','registerCampaign','collectAdvertisingProof','redeemAdvertisingProof','campaignStatus','registerSubscription','releaseSubscription','subscriptionStatus','superlikeService','subscriptionService','advertisingRequirement']:
 entries.append({'id':'use-case.'+value,'kind':'name','relation':'equal','description':'Exact dummy economic adapter interface used by executable acceptance tests.','sides':[side('privacy_sandbox','defines','sandbox/use-cases.js',value),side('external:sandbox_tests','consumes','tests/sandbox-use-cases.test.js',value)]})
value='hp2p.sandbox.advertising.campaign.v1'
entries.append({'id':'advertising.campaign-domain','kind':'claim','relation':'equal','description':'Campaign signatures are domain-separated from currency issuance and reward claims.','sides':[side('external:specification','defines','contracts/privacy_sandbox/requirements.json',value),side('privacy_sandbox','consumes','sandbox/use-cases.js',value)]})
register={'schema':'boundary-register/1','entries':entries}
BoundaryRegister.model_validate(register)
regtext=yaml.safe_dump(register,sort_keys=False)
(root/'.constrain/artifacts/boundary_register.yaml').write_text(regtext)
cpath=root/'contracts/privacy_sandbox/interface.json'
c=json.loads(cpath.read_text()); c['boundary_identifiers']=entries
cpath.write_text(ComponentContract.model_validate(c).model_dump_json(indent=2)+'\n')
cases=[]
for path in sorted(root.glob('tests/sandbox*.test.js')):
 for title in re.findall(r"^test\('([^']+)'",path.read_text(),re.M):
  cases.append({'id':f'HP2P-SBX-{len(cases)+1:03}','description':title,'function':(('settlePromise' if title.startswith('signed promises') else 'redeemSuperlike' if ('superlikes' in title or 'self-tipping' in title) else 'releaseSubscription' if title.startswith('subscription') else 'collectAdvertisingProof' if title.startswith('advertising collection') else 'redeemAdvertisingProof') if path.name=='sandbox-use-cases.test.js' else ('openPublisherMessage' if ('composed' in title or 'subscriber with the monthly key' in title) else 'readPublisherMessage' if 'publisher-only' in title else 'open' if 'monthly symmetric' in title else 'negotiationWindow' if 'negotiation window' in title else 'reward' if any(x in title for x in ('advertising rewards','expired offers','distinct recipients')) else 'issue' if any(x in title for x in ('issuer-signed','issuance and output','independent authorities')) else 'redeem' if 'competing spends' in title else 'transfer')),'category':'invariant','setup_description':str(path.relative_to(root)),'assertions':[title]})
suite=ContractTestSuite(component_id='privacy_sandbox',contract_version=1,test_cases=cases,test_language='javascript')
(root/'contracts/privacy_sandbox/test_suite.json').write_text(suite.model_dump_json(indent=2)+'\n')
art=root/'.constrain/artifacts'
s=Session(id='hp2p-offline-contracts',posture=Posture.adversarial,phase=Phase.complete,prompt_md=(art/'prompt.md').read_text(),constraints_yaml=(art/'constraints.yaml').read_text(),trust_policy_yaml=(art/'trust_policy.yaml').read_text(),component_map_yaml=(art/'component_map.yaml').read_text(),schema_hints_yaml=(art/'schema_hints.yaml').read_text(),boundary_register_yaml=regtext)
(root/'.constrain/sessions/hp2p-offline-contracts.json').write_text(s.model_dump_json(indent=2)+'\n')
print(f'Pinned {len(entries)} boundary entries and {len(cases)} existing executable test descriptions. Session is manually imported, not an LLM interview.')
