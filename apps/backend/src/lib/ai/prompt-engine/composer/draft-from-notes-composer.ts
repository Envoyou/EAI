import { CompositePromptNode, RenderContext } from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode } from '../core/rules';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';
import {
  DraftFromNotesRoleNode,
  DraftFromNotesConstraintsNode,
  DraftFromNotesExampleOutputNode,
  RelatedContentGuidanceNode,
} from '../core/strategist';
import { VisualFormatSelectionPolicyNode } from '../core/format';

export class DraftFromNotesComposer {
  constructor(private profile?: EditorialProfileConfig | null) {}

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';

    const missionNode = new EditorialMissionNode();
    const roleNode = new DraftFromNotesRoleNode();
    const langPolicyNode = new LanguagePolicyNode();
    const constraintsNode = new DraftFromNotesConstraintsNode();
    const examplesNode = new DraftFromNotesExampleOutputNode();
    const visualFormatNode = new VisualFormatSelectionPolicyNode();

    const root = new CompositePromptNode('draft_from_notes_composer');
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(constraintsNode);
    root.addChild(new RelatedContentGuidanceNode());
    root.addChild(visualFormatNode);
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
