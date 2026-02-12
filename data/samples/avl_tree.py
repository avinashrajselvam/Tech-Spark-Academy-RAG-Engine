"""
Antigravity RAG — Sample Python Module
Binary search tree implementation for demo ingestion.
"""

class TreeNode:
    """A node in a binary search tree."""
    
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None
        self.height = 1


class AVLTree:
    """Self-balancing AVL tree implementation.
    
    Maintains O(log n) height through rotations after
    each insert/delete operation.
    """
    
    def __init__(self):
        self.root = None
        self.size = 0
    
    def insert(self, value):
        """Insert a value into the AVL tree."""
        self.root = self._insert(self.root, value)
        self.size += 1
    
    def _insert(self, node, value):
        if node is None:
            return TreeNode(value)
        
        if value < node.value:
            node.left = self._insert(node.left, value)
        elif value > node.value:
            node.right = self._insert(node.right, value)
        else:
            return node  # Duplicate values not allowed
        
        node.height = 1 + max(
            self._get_height(node.left),
            self._get_height(node.right)
        )
        
        balance = self._get_balance(node)
        
        # Left-Left case
        if balance > 1 and value < node.left.value:
            return self._rotate_right(node)
        
        # Right-Right case
        if balance < -1 and value > node.right.value:
            return self._rotate_left(node)
        
        # Left-Right case
        if balance > 1 and value > node.left.value:
            node.left = self._rotate_left(node.left)
            return self._rotate_right(node)
        
        # Right-Left case
        if balance < -1 and value < node.right.value:
            node.right = self._rotate_right(node.right)
            return self._rotate_left(node)
        
        return node
    
    def search(self, value):
        """Search for a value in the tree. Returns True if found."""
        return self._search(self.root, value)
    
    def _search(self, node, value):
        if node is None:
            return False
        if value == node.value:
            return True
        if value < node.value:
            return self._search(node.left, value)
        return self._search(node.right, value)
    
    def inorder(self):
        """Return values in sorted order."""
        result = []
        self._inorder(self.root, result)
        return result
    
    def _inorder(self, node, result):
        if node:
            self._inorder(node.left, result)
            result.append(node.value)
            self._inorder(node.right, result)
    
    def _get_height(self, node):
        return node.height if node else 0
    
    def _get_balance(self, node):
        if node is None:
            return 0
        return self._get_height(node.left) - self._get_height(node.right)
    
    def _rotate_left(self, z):
        y = z.right
        t2 = y.left
        y.left = z
        z.right = t2
        z.height = 1 + max(self._get_height(z.left), self._get_height(z.right))
        y.height = 1 + max(self._get_height(y.left), self._get_height(y.right))
        return y
    
    def _rotate_right(self, z):
        y = z.left
        t3 = y.right
        y.right = z
        z.left = t3
        z.height = 1 + max(self._get_height(z.left), self._get_height(z.right))
        y.height = 1 + max(self._get_height(y.left), self._get_height(y.right))
        return y


def benchmark_tree(n=10000):
    """Benchmark the AVL tree with n insertions and searches."""
    import time
    
    tree = AVLTree()
    values = list(range(n))
    
    # Insert
    start = time.perf_counter()
    for v in values:
        tree.insert(v)
    insert_time = time.perf_counter() - start
    
    # Search
    start = time.perf_counter()
    for v in values:
        tree.search(v)
    search_time = time.perf_counter() - start
    
    print(f"AVL Tree Benchmark (n={n}):")
    print(f"  Insert: {insert_time*1000:.2f}ms")
    print(f"  Search: {search_time*1000:.2f}ms")
    print(f"  Size: {tree.size}")
    
    return tree


if __name__ == "__main__":
    benchmark_tree()
