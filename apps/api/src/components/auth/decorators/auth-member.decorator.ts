import { createParamDecorator } from '@nestjs/common';

import type { AuthenticatedMember } from '../../../libs/types/authenticated-member.type';
import { getAuthenticatedRequest } from '../auth-context';

type AuthMemberProperty = keyof AuthenticatedMember | undefined;
type AuthMemberValue =
  | AuthenticatedMember
  | AuthenticatedMember[keyof AuthenticatedMember]
  | undefined;

export const AuthMember = createParamDecorator<
  AuthMemberProperty,
  AuthMemberValue
>((property, context) => {
  const member = getAuthenticatedRequest(context).authMember;

  return property === undefined ? member : member?.[property];
});
