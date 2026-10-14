"""Build local map data from MSBB, HKX, PARAM and FMG; no guessed coordinates."""
import json, shutil, collections, sys
from rune_catalog import collect_runes
from pathlib import Path
from npc_catalog import collect_npcs
from passage_catalog import collect_passages
ROOT=Path(__file__).resolve().parents[1]
raw=json.loads((ROOT/'artifacts/extracted/raw.json').read_text('utf-8'))
npc_maps=json.loads((ROOT/'artifacts/extracted/npc-parts.json').read_text('utf-8'))
OUT=ROOT/'web/data'
texts={k:{r['ID']:r['Text'].strip() for r in v} for k,v in raw['texts'].items()}
params={k:{r['ID']:r['cells'] for r in v} for k,v in raw['parameters'].items()}
areas=[
 ('m21_00_00_00','獵人夢境',"Hunter's Dream"),
 ('m24_01_00_00','雅南中部／尤瑟夫卡診所','Central Yharnam / Clinic'),
 ('m24_00_00_00','教堂病房','Cathedral Ward'),
 ('m23_00_00_00','舊雅南／黑獸墓地','Old Yharnam / Graveyard'),
 ('m22_00_00_00','漢威克陰森小巷','Hemwick Charnel Lane'),
 ('m21_01_00_00','廢棄舊工廠','Abandoned Old Workshop'),
 ('m27_00_00_00','禁忌森林','Forbidden Woods'),
 ('m32_00_00_00','拜爾金沃斯／教學大樓','Byrgenwerth / Lecture Building'),
 ('m28_00_00_00','未見之村亞哈革','Yahar’gul, Unseen Village'),
 ('m25_00_00_00','該隱赫斯特城堡','Forsaken Cainhurst Castle'),
 ('m24_02_00_00','教堂上層','Upper Cathedral Ward'),
 ('m33_00_00_00','惡夢邊境','Nightmare Frontier'),
 ('m26_00_00_00','曼希斯的惡夢','Nightmare of Mensis'),
 ('m34_00_00_00','獵人的惡夢','The Hunter’s Nightmare'),
 ('m35_00_00_00','研究大廳／星辰鐘塔','Research Hall / Astral Clocktower'),
 ('m36_00_00_00','漁村','Fishing Hamlet'),
]
# Exact MSB entity IDs, one marker per encounter (omit secondary forms/duplicates).
boss_ids={2100800,2100810,2200800,2300800,2300810,2400800,2410800,2410810,
          2420800,2420810,2500800,2600800,2600850,2700800,2800800,3200800,
          3300800,3400800,3400850,3500800,3500850,3600800}
lamp_names={
 'm21_01_00_00':['廢棄舊工廠'], 'm22_00_00_00':['漢威克陰森小巷','女巫的住處'],
 'm23_00_00_00':['舊雅南','善良金杯教堂','黑獸的墓地'],
 'm24_00_00_00':['教堂病房','大教堂'],
 'm24_01_00_00':['一樓病房','雅南中部','大橋','歐頓之墓'],
 'm24_02_00_00':['教堂上層','絕望祭壇','夜空之眼花園'],
 'm25_00_00_00':['遺忘的該隱赫斯特城堡','污穢血族女王的房間','烈士洛格力斯的王座'],
 'm26_00_00_00':['曼希斯的惡夢','奶媽的月臺','梅高的閣樓：中層','梅高的閣樓：底層'],
 'm27_00_00_00':['禁忌森林','禁忌墓地'],
 'm28_00_00_00':['未見之村亞哈革','降臨廣場','地下監獄','亞哈革教堂'],
 'm32_00_00_00':['拜爾金沃斯','教學大樓一樓','月畔湖','教學大樓二樓'],
 'm33_00_00_00':['惡夢邊境','亞彌達拉的房間'],
 'm34_00_00_00':['獵人的惡夢','惡夢教堂','地下屍堆','惡夢大教堂'],
 'm35_00_00_00':['研究大廳','星輪花園','星辰鐘塔'],
 'm36_00_00_00':['漁村','燈塔小屋','海岸'],
}
lamp_names_en={
 'm21_01_00_00':['Abandoned Old Workshop'], 'm22_00_00_00':['Hemwick Charnel Lane',"Witch's Abode"],
 'm23_00_00_00':['Old Yharnam','Church of the Good Chalice','Graveyard of the Darkbeast'],
 'm24_00_00_00':['Cathedral Ward','Grand Cathedral'],
 'm24_01_00_00':['1st Floor Sickroom','Central Yharnam','Great Bridge','Tomb of Oedon'],
 'm24_02_00_00':['Upper Cathedral Ward','Altar of Despair','Lumenflower Gardens'],
 'm25_00_00_00':['Forsaken Cainhurst Castle',"Vileblood Queen's Chamber",'Martyr Logarius Seat'],
 'm26_00_00_00':['Nightmare of Mensis',"Wet Nurse's Lunarium","Mergo's Loft: Middle","Mergo's Loft: Base"],
 'm27_00_00_00':['Forbidden Woods','Forbidden Grave'],
 'm28_00_00_00':["Yahar'gul, Unseen Village",'Advent Plaza','Hypogean Gaol',"Yahar'gul Chapel"],
 'm32_00_00_00':['Byrgenwerth','Lecture Building','Moonside Lake','Lecture Building 2nd Floor'],
 'm33_00_00_00':['Nightmare Frontier',"Amygdala's Chamber"],
 'm34_00_00_00':["Hunter's Nightmare",'Nightmare Church','Underground Corpse Pile','Nightmare Grand Cathedral'],
 'm35_00_00_00':['Research Hall','Lumenwood Garden','Astral Clocktower'],
 'm36_00_00_00':['Fishing Hamlet','Lighthouse Hut','Coast'],
}
def text(table,id,lang='zhotw'):
 return texts.get(lang+'/'+table,{}).get(id,'')
def item(cat,id):
 if cat==8:
  gen=params.get('GemGenParam',{}).get(id,{})
  effect=params.get('GemeffectParam',{}).get(gen.get('gemeffectGenParam_0'),{})
  mid=(2000000 if gen.get('equipableSegmentBody') and effect.get('sortCategory')==2 else 1000000)+gen.get('gemNameIdOffset',0)+effect.get('gemNameIdOffset',0)
  kind='rune' if gen.get('equipableSegmentBody') else 'gem'
  if gen and effect:
   return text('魔石名',mid) or ('卡爾符文' if kind=='rune' else '血寶石'),text('魔石名',mid,'engus'),kind
  return '血寶石（隨機詞綴）','Blood Gem (variable effects)','gem'
 table={0:'武器名',1:'防具名',2:'アクセサリ名',4:'アイテム名',8:'魔石名'}.get(cat)
 name=text(table,id) if table else ''
 en=text(table,id,'engus') if table else ''
 if not name:name=en
 kind={0:'weapon',1:'armor',2:'rune',8:'item'}.get(cat,'item')
 if cat==4:
  if any(w in name for w in ['鑰匙','徽章','邀請函','臍帶','金杯','工具','秘法','眼睛','髮飾','骨頭','音樂盒','觸手','聖歌','呼喚','咆哮','外殼','手套','鐘','符文']):kind='key'
  if '符文' in name:kind='rune'
  if id==4104:kind='key'  # Workshop tool is not an equippable Caryll rune.
  if id in {1310,2000,2010,2020,2050,2060,2070,2080,2110,2120,2130}:kind='tool'
 return name or f'物品 #{id}',en,kind
data={'version':1,'maps':[],'sources':['Local Bloodborne v1.09 MSBB / low collision HKX / PARAM / FMG','https://github.com/Grimrukh/soulstruct-vanilla/tree/main/bloodborne','https://github.com/Meowmaritus/MVDX_Classic'],'limitations':['人物唯讀定位；武器、服裝、符文、工具、重要道具與 Boss 讀取存檔快照，其餘手動記錄。','包含本體與老獵人 DLC；不含程序生成的金杯地牢。','地形為靜態低精度碰撞網格；部分機關、門與可破壞物件不在地形中。','拾取點不涵蓋所有商店、敵人掉落及事件獎勵；未定位條目只列清單。']}
for id,zh,en in areas:
 m=raw['maps'][id]; parts={p['Name']:p for p in m['parts']}; regions={r['Name']:r for r in m['regions']}; markers=[]
 def add(key,name,kind,p,note,en='',**kw):
  markers.append(dict(id=id+':'+key,name=name,en=en,kind=kind,p=p,note=note,**kw))
 for entry in collect_passages((ROOT/'artifacts/reference'/(id+'.evs.py')).read_text('utf-8'),m['parts']):
  add('passage:'+str(entry['entity']),kind='passage',**entry)
 npc_map=npc_maps[id]
 for n in collect_npcs(npc_map['parts'],npc_map['source']):
  add('npc:'+str(n['entity']),kind='npc',**n)
 for p in m['parts']:
  eid=p['EntityID']
  if p['type']=='Object' and p['ModelName']=='o009900':
   index=eid%10000-1950;names=lamp_names.get(id,[])
   name=names[index] if 0<=index<len(names) else '燈籠'
   names_en=lamp_names_en.get(id,[])
   english_name=names_en[index] if 0<=index<len(names_en) else 'Lamp'
   add('lamp:'+str(eid),name,'lamp',p['p'],'燈籠位置；部分需擊敗 Boss 或滿足劇情條件才可使用。',en=english_name,entity=eid)
  if eid in boss_ids:
   npc=params['NpcParam'].get(p['npc'],{}); nid={2700800:212010,2420810:257000,2600850:899000,2600800:551000}.get(eid,npc.get('nameId',p['npc']))
   name=text('NPC名',nid) or 'Boss';eng=text('NPC名',nid,'engus')
   add('boss:'+str(eid),name,'boss',p['p'],'Boss 初始位置；戰鬥中可能移動或切換形態。',en=eng,entity=eid)
 if id=='m21_00_00_00':
  # The dream uses a spawn region, not the o009900 lamp model.
  spawn=m['spawns'][0]; r=regions.get(spawn['SpawnPointName'])
  if r:add('hub','獵人夢境返回點','lamp',r['p'],'夢境返回／重生點，並非可點燃的普通燈籠。',en="Hunter's Dream return point",noteEn='Dream return / respawn point, rather than a lamp that can be lit.')
 for t in m['treasures']:
  p=parts.get(t['TreasurePartName'] or t.get('PartName')) or regions.get(t.get('RegionName'))
  entries=[];flags=[]; ownership=[]
  for lotid in t['lots']:
   lot=params['ItemLotParam'].get(lotid)
   if not lot:continue
   flags.append(lot.get('getItemFlagId',-1))
   for i in range(1,9):
    s=f'{i:02}';iid=lot.get('lotItemId'+s,0);weight=lot.get('lotItemBasePoint'+s,0)
    if iid<=0 or weight<=0:continue
    cat=lot['lotItemCategory'+s]
    name,eng,kind=item(cat,iid)
    if cat in (0,1,4):ownership.append(str(cat)+':'+str(iid-iid%10000 if cat==0 else iid))
    elif cat==8 and kind=='rune':ownership.append('rune:'+str(params['GemGenParam'].get(iid,{}).get('gemeffectGenParam_0',-1)))
    count=lot.get('lotItemNum'+s,1)
    entries.append((name+(f' ×{count}' if count>1 else ''),eng,kind))
  if not entries:continue
  entries=list(dict.fromkeys(entries));priority=['weapon','armor','rune','tool','key','gem','item']
  kind=min((e[2] for e in entries),key=priority.index)
  name=' / '.join(e[0] for e in entries)
  note='固定拾取事件。'+(' 部分多項內容可能受周目或事件條件影響。' if len(entries)>1 else '')
  if '物品 #' in name:note+=' 名稱未能對應本版遊戲文字，可能為未使用資料。'
  if not p:note+=' 此事件未綁定可靠地圖物件，未定位；可能為備用或劇情事件。'
  add('treasure:'+str(t['lots'][0])+':'+t['Name'],name,kind,p['p'] if p else None,note,en=' / '.join(e[1] for e in entries),lots=t['lots'],flags=flags,ownership=list(dict.fromkeys(ownership)))
 markers.extend(collect_runes(id,m,params,item,npc_map['parts']))
 mesh=id+'.mesh'
 if '--markers-only' not in sys.argv:shutil.copy2(ROOT/'artifacts/extracted'/mesh,OUT/mesh)
 data['maps'].append(dict(id=id,name=zh,en=en,dlc=id[:3] in ('m34','m35','m36'),mesh=mesh,markers=markers))
# Link guides to existing MSB NPC positions; never invent quest coordinates.
quests=json.loads((OUT/'quests.json').read_text('utf-8'))['quests']
quest_by_entity={entity:q for q in quests for entity in q['entities']}
for area in data['maps']:
 for marker in area['markers']:
  if marker['kind']=='npc' and marker['entity'] in quest_by_entity:
   q=quest_by_entity[marker['entity']]
   marker.update(questId=q['id'],questTitle=q['title'],questEn=q['en'])
(OUT/'maps.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),'utf-8')
# Local inventory names include shops/rewards without inventing pickup positions.
# Like maps.json, this extracted FMG catalog is private generated game data.
catalog={}
for cat,table in [(0,'武器名'),(1,'防具名'),(4,'アイテム名')]:
 for iid in sorted(set(texts.get('engus/'+table,{}))|set(texts.get('zhotw/'+table,{}))):
  if iid<=0 or (cat==0 and iid%10000):continue
  name,en,kind=item(cat,iid)
  if not (text(table,iid) or text(table,iid,'engus')):continue
  catalog[str(cat)+':'+str(iid)]={'name':name,'en':en,'kind':kind}
for iid,gen in params.get('GemGenParam',{}).items():
 effect=gen.get('gemeffectGenParam_0',-1)
 if effect<=0:continue
 name,en,kind=item(8,iid)
 if not en:continue
 key=('rune:' if kind=='rune' else 'gem:')+str(effect)
 catalog.setdefault(key,{'name':name,'en':en,'kind':kind})
for effect,values in params.get('GemeffectParam',{}).items():
 # Random gems can use effects not referenced by any fixed GemGen lot.
 if effect<=0 or values.get('sortCategory')==2:continue
 mid=1000000+values.get('gemNameIdOffset',0)
 name=text('魔石名',mid);en=text('魔石名',mid,'engus')
 if name or en:catalog.setdefault('gem:'+str(effect),{'name':name or en,'en':en,'kind':'gem'})
(OUT/'inventory-catalog.json').write_text(json.dumps({'version':1,'items':catalog},ensure_ascii=False,separators=(',',':')),'utf-8')
counts=collections.Counter(x['kind'] for m in data['maps'] for x in m['markers'])
print(json.dumps({'maps':len(data['maps']),'markers':counts,'unlocated':sum(x['p'] is None for m in data['maps'] for x in m['markers'])},ensure_ascii=False))
