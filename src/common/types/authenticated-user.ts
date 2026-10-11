import { Role } from '../../users/role.enum';

export interface AuthenticatedUser {
  id: string;
  role: Role;
}
