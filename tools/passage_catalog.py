"""Match explicit event interactions to actual MSB objects, never estimated pins."""
import ast

def collect_passages(source, parts):
    tree=ast.parse(source)
    functions={x.name:x for x in tree.body if isinstance(x,ast.FunctionDef)}
    ladders={name for name,f in functions.items() if any(isinstance(c,ast.Call) and isinstance(c.func,ast.Name) and c.func.id=='RegisterLadder' for c in ast.walk(f))}
    objects={p['EntityID']:p for p in parts if p['type']=='Object' and p['EntityID']>0}
    found={}
    for c in ast.walk(tree):
        if not isinstance(c,ast.Call) or not isinstance(c.func,ast.Name):continue
        kw={k.arg:k.value.value for k in c.keywords if isinstance(k.value,ast.Constant)}
        obj=kw.get('obj');p=objects.get(obj)
        if not p:continue
        kind='ladder' if c.func.id=='RegisterLadder' or c.func.id in ladders else 'mechanism' if c.func.id.startswith('Event_') and 'obj_act_id' in kw else None
        if not kind:continue
        if p['ModelName']=='o009900':continue
        found[obj]=dict(entity=obj,p=p['p'],rotation=p['r'],passageType=kind,
            name=('梯子通道' if kind=='ladder' else '互動門／機關')+' #'+str(obj),
            en=('Ladder' if kind=='ladder' else 'Interactive door / mechanism')+' #'+str(obj),
            note='事件腳本確認的'+('梯子' if kind=='ladder' else '互動物件')+'。位置與朝向取自 MSB；通行／發現狀態需手動確認，並不表示目前已開啟或一定是捷徑。')
    return list(found.values())
