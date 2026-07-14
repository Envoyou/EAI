import { CompositePromptNode, RenderContext } from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode } from '../core/rules';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';
import { StrategistSystemRoleNode, StrategistGeneralConstraintsNode, StrategistExamplesNode } from '../core/strategist';

export class StrategistChatComposer {
  constructor(private profile?: EditorialProfileConfig | null) {}

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';

    const missionNode = new EditorialMissionNode();
    const roleNode = new StrategistSystemRoleNode();
    const langPolicyNode = new LanguagePolicyNode();
    const constraintsNode = new StrategistGeneralConstraintsNode();
    const examplesNode = new StrategistExamplesNode();

    const root = new CompositePromptNode('strategist_chat_composer');
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(constraintsNode);
    root.addChild(examplesNode);

    // Tenant Nodes
    if (this.profile) {
      root.addChild(new BrandIdentityNode(this.profile));
      root.addChild(new ToneCalibrationNode(this.profile));
    }

    const context: RenderContext = {
      format,
      brandName
    };

    return root.render(context);
  }
}
