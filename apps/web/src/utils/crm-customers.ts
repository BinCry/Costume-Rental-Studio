import { matchesCustomerSearch } from './phone';

/**
 * Customers listed in the CRM for one branch. When the list comes from the server it is already
 * scoped to the branch (preferred branch or orders there), so it must not be filtered again by
 * preferred branch: customers who registered online have none and would disappear.
 */
export function visibleBranchCustomers<
  T extends { name: string; phone: string; code: string; email?: string; preferredBranch: string },
>(customers: T[], branch: string, search: string, scopedByServer: boolean): T[] {
  return customers.filter(
    (customer) =>
      (scopedByServer || customer.preferredBranch === branch) &&
      matchesCustomerSearch(customer, search),
  );
}
