/**
 * Optimistic Update Utility
 * 
 * Provides a consistent pattern for optimistic UI updates with rollback support.
 * This ensures instant UI feedback while maintaining data consistency.
 */

export type MutationType = 'create' | 'update' | 'delete';

export interface OptimisticUpdateOptions<T> {
  /** Current state array */
  currentState: T[];
  /** Type of mutation */
  mutationType: MutationType;
  /** Function to apply optimistic change to state */
  optimisticUpdate: (state: T[]) => T[];
  /** Async function that performs the server mutation */
  serverMutation: () => Promise<any>;
  /** Function to extract the updated item from server response (for create/update) */
  extractItem?: (response: any) => T | null;
  /** Function to get item ID for comparison */
  getItemId: (item: T) => string | number;
  /** Function to refresh state from server (background revalidation) */
  refreshState: () => Promise<void>;
  /** Error handler - called if mutation fails */
  onError?: (error: any) => void;
  /** Success handler - called after successful mutation */
  onSuccess?: (result: any) => void;
}

/**
 * Performs an optimistic update with automatic rollback on failure.
 * 
 * Flow:
 * 1. Immediately apply optimistic change to local state
 * 2. Perform server mutation in background
 * 3. On success: refresh state from server (revalidation)
 * 4. On failure: rollback to previous state and call error handler
 * 
 * @returns Updated state array (optimistically)
 */
export async function performOptimisticUpdate<T>({
  currentState,
  mutationType,
  optimisticUpdate,
  serverMutation,
  extractItem,
  getItemId,
  refreshState,
  onError,
  onSuccess,
}: OptimisticUpdateOptions<T>): Promise<T[]> {
  // Save previous state for rollback
  const previousState = [...currentState];
  
  // Apply optimistic update immediately
  const optimisticState = optimisticUpdate([...currentState]);
  
  try {
    // Perform server mutation
    const serverResponse = await serverMutation();
    
    // Call success handler if provided
    if (onSuccess) {
      onSuccess(serverResponse);
    }
    
    // Refresh state from server in background (revalidation)
    // Don't await - let it happen in background
    refreshState().catch((refreshError) => {
      console.error('Background refresh failed:', refreshError);
      // If refresh fails, we still have optimistic state which should be close
    });
    
    return optimisticState;
  } catch (error) {
    // Rollback to previous state on error
    console.error('Mutation failed, rolling back:', error);
    
    // Call error handler if provided
    if (onError) {
      onError(error);
    }
    
    // Return previous state (caller should use this to update state)
    return previousState;
  }
}

/**
 * Helper to create optimistic state updater for create operations
 */
export function createOptimisticUpdater<T>(
  newItem: T
): (state: T[]) => T[] {
  return (state) => [newItem, ...state];
}

/**
 * Helper to create optimistic state updater for update operations
 */
export function updateOptimisticUpdater<T>(
  updatedItem: T,
  getItemId: (item: T) => string | number
): (state: T[]) => T[] {
  return (state) =>
    state.map((item) =>
      getItemId(item) === getItemId(updatedItem) ? updatedItem : item
    );
}

/**
 * Helper to create optimistic state updater for delete operations
 */
export function deleteOptimisticUpdater<T>(
  itemId: string | number,
  getItemId: (item: T) => string | number
): (state: T[]) => T[] {
  return (state) => state.filter((item) => getItemId(item) !== itemId);
}
