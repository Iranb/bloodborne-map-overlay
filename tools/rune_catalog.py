"""Rune sources omitted by MSB treasure-only extraction.

Coordinates come exclusively from local MSB entities/regions. Drop locations
are initial placements, not live NPC tracking. Quest associations are curated
against Bloodborne Wiki; boss/gesture rewards also reference local EVS scripts.
"""
WIKI = 'https://www.bloodborne-wiki.com/p/caryll-runes.html'
# map, lot, coordinate type, entity, acquisition condition (zh/en).
REWARDS = [
 ('m25_00_00_00',17000,'parts',2500600,'向安娜莉絲宣誓加入污穢血族。','Join the Vilebloods through Annalise.'),
 ('m24_00_00_00',35010,'parts',2400903,'完成艾琳任務，擊敗大教堂的敵對獵人後向艾琳取得。','Complete Eileen’s quest and speak to her after defeating the cathedral hunter.'),
 ('m27_00_00_00',43120,'parts',2700912,'與沃爾特交談並加入聯盟。','Speak to Valtr and join the League.'),
 ('m32_00_00_00',39010,'parts',3200101,'完成蜘蛛帕奇的相關對話後取得。','Complete the relevant dialogue with Patches.'),
 ('m35_00_00_00',43020,'parts',3500911,'完成阿黛琳的腦液任務後取得；此為後期形態的位置。','Complete Adeline’s Brain Fluid quest; this marks her late quest placement.'),
 ('m27_00_00_00',2700990,'parts',2700800,'擊敗雅南暗影的獎勵。','Reward for defeating the Shadows of Yharnam.'),
 ('m24_02_00_00',25700000,'parts',2420800,'擊敗天庭使者的獎勵。','Reward for defeating the Celestial Emissary.'),
 ('m34_00_00_00',3401800,'parts',3400800,'擊敗路德維希的獎勵。','Reward for defeating Ludwig.'),
 ('m34_00_00_00',3401850,'parts',3400850,'擊敗勞倫斯的獎勵。','Reward for defeating Laurence.'),
 ('m24_00_00_00',75002400,'parts',2400450,'擊敗工廠下方的獸魂附體者取得。','Defeat the Beast-possessed Soul below the workshop.'),
 ('m26_00_00_00',2605000,'regions',2602022,'將曼希斯之腦放下後，在深淵中做完整的「取得聯繫」動作。此點為事件觸發區域中心。','Drop the Brain of Mensis and perform the full Make Contact gesture in the abyss. Marks the trigger region center.'),
]

def collect_runes(map_id, map_data, params, item_name, npc_parts=()):
    markers=[]; seen=set()
    def add(lot_id, part, condition, condition_en, source_type):
        lot=params['ItemLotParam'].get(lot_id,{})
        for i in range(1,9):
            suffix=f'{i:02}'; iid=lot.get('lotItemId'+suffix,0)
            if lot.get('lotItemCategory'+suffix)!=8 or lot.get('lotItemBasePoint'+suffix,0)<=0: continue
            gen=params['GemGenParam'].get(iid,{})
            if not gen.get('equipableSegmentBody'):continue
            effect=gen.get('gemeffectGenParam_0',-1)
            # Alternate story actors at the same placement share one source.
            key=(effect,tuple(round(v,1) for v in part['p']))
            if key in seen:continue
            seen.add(key)
            name,en,kind=item_name(8,iid)
            if kind!='rune':raise ValueError('Rune misclassified')
            markers.append(dict(id=f'{map_id}:rune-source:{source_type}:{part["EntityID"]}:{effect}',name=name,en=en,kind='rune',p=part['p'],
                note=condition+' 角色可能移動或因劇情消失；持有辨識可能來自其他來源。',
                noteEn=condition_en+' Actors may move or disappear with story progress. Observed ownership can come from another source.',
                entity=part['EntityID'],lots=[lot_id],flags=[lot.get('getItemFlagId',-1)],ownership=[f'rune:{effect}'],
                source=f'{map_id}.msb.dcx / NpcParam / ItemLotParam / GemGenParam',sourceType=source_type,reference=WIKI))
    for part in map_data['parts']:
        if part.get('type')!='Enemy' or part.get('EntityID',-1)<=0:continue
        npc=params['NpcParam'].get(part.get('npc'),{})
        for field,first in npc.items():
            if not field.startswith('itemLotId_') or first<=0:continue
            # Explicit lot plus adjacent rows in its 10-ID lot group; never
            # treat the next 10-ID group's quest reward as an ordinary drop.
            for lot_id in range(first,first-first%10+10):
                add(lot_id,part,'NPC／敵人掉落來源，須符合其劇情與掉落條件；此處標示初始配置位置，並非地面拾取物。對友善 NPC 動手可能中斷任務。',
                    'Conditional NPC/enemy drop at its initial placement, not a ground pickup. Attacking a friendly NPC may end its quest.','drop')
    for mid,lot_id,kind,eid,note,en in REWARDS:
        if mid!=map_id:continue
        matches=[p for p in map_data[kind] if p.get('EntityID')==eid]
        if not matches and kind=='parts':matches=[p for p in npc_parts if p.get('EntityID')==eid]
        if not matches:raise ValueError(f'Missing verified rune anchor {mid}:{eid}')
        add(lot_id,matches[0],note,en,'reward')
    return markers
