"""Contrôle de l'arithmétique d'exemples de conception, pas test de l'application."""
from decimal import Decimal, ROUND_HALF_UP

def rounded(x):
    return int(Decimal(x).quantize(Decimal('1'),rounding=ROUND_HALF_UP))

# RM02 : arrondis documentés.
assert rounded(Decimal('999')*Decimal('0.05'))==50
assert rounded(Decimal('0.125')*2000)==250

# RM10 : obligations fournisseur et frais externes distincts.
goods=10000
supplier_fees=500
external_fees=300
assert goods+supplier_fees==10500
value=goods+supplier_fees+external_fees
assert value==10800
assert value*4//10==4320 and value*6//10==6480

# RM11 : retour après abandon, aucune restitution d'argent jamais encaissé.
return_net=4000
live_due=2000
writeoff=1000
paid=2000
debt_reduction=min(return_net,live_due)
reversed_writeoff=min(return_net-debt_reduction,writeoff)
refund=return_net-debt_reduction-reversed_writeoff
assert (debt_reduction,reversed_writeoff,refund)==(2000,1000,1000)
assert refund<=paid

# T84 : scénario complet, opérations de sources différentes.
cash=50000+2000-1000+1000+10000-3500
assert cash==58500
declared=58000
delta=declared-cash
assert delta==-500
assert sum([delta,-delta])==0
cash+=delta
assert cash==declared
cash+=2000-1000
assert cash==59000
assert sum([2000,-2000])==0 # reclassification de variance équilibrée sans cash

# Couches à reliquat final : somme des coûts sortis conservée.
qty=Decimal('3')
value=100
costs=[]
while qty:
    out=rounded(Decimal(value)/qty) if qty>1 else value
    costs.append(out)
    value-=out
    qty-=1
assert sum(costs)==100 and value==0
print('OK : exemples RM02, RM10, RM11, T57 et T84 cohérents arithmétiquement.')
print('Aucun service applicatif, migration SQL ou mécanisme de synchronisation exécuté.')
