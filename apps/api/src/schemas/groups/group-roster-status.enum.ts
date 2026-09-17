import { registerEnumType } from '@nestjs/graphql';

export enum GroupRosterStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DEBTOR = 'DEBTOR',
  DEPARTED = 'DEPARTED',
}

registerEnumType(GroupRosterStatus, { name: 'GroupRosterStatus' });
