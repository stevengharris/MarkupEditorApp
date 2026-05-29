// ::- Persistent data structure representing an ordered mapping from
// strings to values, with some convenient update methods.
function OrderedMap$1(content) {
  this.content = content;
}

OrderedMap$1.prototype = {
  constructor: OrderedMap$1,

  find: function(key) {
    for (var i = 0; i < this.content.length; i += 2)
      if (this.content[i] === key) return i
    return -1
  },

  // :: (string) → ?any
  // Retrieve the value stored under `key`, or return undefined when
  // no such key exists.
  get: function(key) {
    var found = this.find(key);
    return found == -1 ? undefined : this.content[found + 1]
  },

  // :: (string, any, ?string) → OrderedMap
  // Create a new map by replacing the value of `key` with a new
  // value, or adding a binding to the end of the map. If `newKey` is
  // given, the key of the binding will be replaced with that key.
  update: function(key, value, newKey) {
    var self = newKey && newKey != key ? this.remove(newKey) : this;
    var found = self.find(key), content = self.content.slice();
    if (found == -1) {
      content.push(newKey || key, value);
    } else {
      content[found + 1] = value;
      if (newKey) content[found] = newKey;
    }
    return new OrderedMap$1(content)
  },

  // :: (string) → OrderedMap
  // Return a map with the given key removed, if it existed.
  remove: function(key) {
    var found = this.find(key);
    if (found == -1) return this
    var content = this.content.slice();
    content.splice(found, 2);
    return new OrderedMap$1(content)
  },

  // :: (string, any) → OrderedMap
  // Add a new key to the start of the map.
  addToStart: function(key, value) {
    return new OrderedMap$1([key, value].concat(this.remove(key).content))
  },

  // :: (string, any) → OrderedMap
  // Add a new key to the end of the map.
  addToEnd: function(key, value) {
    var content = this.remove(key).content.slice();
    content.push(key, value);
    return new OrderedMap$1(content)
  },

  // :: (string, string, any) → OrderedMap
  // Add a key after the given key. If `place` is not found, the new
  // key is added to the end.
  addBefore: function(place, key, value) {
    var without = this.remove(key), content = without.content.slice();
    var found = without.find(place);
    content.splice(found == -1 ? content.length : found, 0, key, value);
    return new OrderedMap$1(content)
  },

  // :: ((key: string, value: any))
  // Call the given function for each key/value pair in the map, in
  // order.
  forEach: function(f) {
    for (var i = 0; i < this.content.length; i += 2)
      f(this.content[i], this.content[i + 1]);
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a new map by prepending the keys in this map that don't
  // appear in `map` before the keys in `map`.
  prepend: function(map) {
    map = OrderedMap$1.from(map);
    if (!map.size) return this
    return new OrderedMap$1(map.content.concat(this.subtract(map).content))
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a new map by appending the keys in this map that don't
  // appear in `map` after the keys in `map`.
  append: function(map) {
    map = OrderedMap$1.from(map);
    if (!map.size) return this
    return new OrderedMap$1(this.subtract(map).content.concat(map.content))
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a map containing all the keys in this map that don't
  // appear in `map`.
  subtract: function(map) {
    var result = this;
    map = OrderedMap$1.from(map);
    for (var i = 0; i < map.content.length; i += 2)
      result = result.remove(map.content[i]);
    return result
  },

  // :: () → Object
  // Turn ordered map into a plain object.
  toObject: function() {
    var result = {};
    this.forEach(function(key, value) { result[key] = value; });
    return result
  },

  // :: number
  // The amount of keys in this map.
  get size() {
    return this.content.length >> 1
  }
};

// :: (?union<Object, OrderedMap>) → OrderedMap
// Return a map with the given content. If null, create an empty
// map. If given an ordered map, return that map itself. If given an
// object, create a map from the object's properties.
OrderedMap$1.from = function(value) {
  if (value instanceof OrderedMap$1) return value
  var content = [];
  if (value) for (var prop in value) content.push(prop, value[prop]);
  return new OrderedMap$1(content)
};

function findDiffStart$1(a, b, pos) {
    for (let i = 0;; i++) {
        if (i == a.childCount || i == b.childCount)
            return a.childCount == b.childCount ? null : pos;
        let childA = a.child(i), childB = b.child(i);
        if (childA == childB) {
            pos += childA.nodeSize;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return pos;
        if (childA.isText && childA.text != childB.text) {
            for (let j = 0; childA.text[j] == childB.text[j]; j++)
                pos++;
            return pos;
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffStart$1(childA.content, childB.content, pos + 1);
            if (inner != null)
                return inner;
        }
        pos += childA.nodeSize;
    }
}
function findDiffEnd$1(a, b, posA, posB) {
    for (let iA = a.childCount, iB = b.childCount;;) {
        if (iA == 0 || iB == 0)
            return iA == iB ? null : { a: posA, b: posB };
        let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize;
        if (childA == childB) {
            posA -= size;
            posB -= size;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return { a: posA, b: posB };
        if (childA.isText && childA.text != childB.text) {
            let same = 0, minSize = Math.min(childA.text.length, childB.text.length);
            while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
                same++;
                posA--;
                posB--;
            }
            return { a: posA, b: posB };
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffEnd$1(childA.content, childB.content, posA - 1, posB - 1);
            if (inner)
                return inner;
        }
        posA -= size;
        posB -= size;
    }
}

/**
A fragment represents a node's collection of child nodes.

Like nodes, fragments are persistent data structures, and you
should not mutate them or their content. Rather, you create new
instances whenever needed. The API tries to make this easy.
*/
let Fragment$1 = class Fragment {
    /**
    @internal
    */
    constructor(
    /**
    The child nodes in this fragment.
    */
    content, size) {
        this.content = content;
        this.size = size || 0;
        if (size == null)
            for (let i = 0; i < content.length; i++)
                this.size += content[i].nodeSize;
    }
    /**
    Invoke a callback for all descendant nodes between the given two
    positions (relative to start of this fragment). Doesn't descend
    into a node when the callback returns `false`.
    */
    nodesBetween(from, to, f, nodeStart = 0, parent) {
        for (let i = 0, pos = 0; pos < to; i++) {
            let child = this.content[i], end = pos + child.nodeSize;
            if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
                let start = pos + 1;
                child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
            }
            pos = end;
        }
    }
    /**
    Call the given callback for every descendant node. `pos` will be
    relative to the start of the fragment. The callback may return
    `false` to prevent traversal of a given node's children.
    */
    descendants(f) {
        this.nodesBetween(0, this.size, f);
    }
    /**
    Extract the text between `from` and `to`. See the same method on
    [`Node`](https://prosemirror.net/docs/ref/#model.Node.textBetween).
    */
    textBetween(from, to, blockSeparator, leafText) {
        let text = "", first = true;
        this.nodesBetween(from, to, (node, pos) => {
            let nodeText = node.isText ? node.text.slice(Math.max(from, pos) - pos, to - pos)
                : !node.isLeaf ? ""
                    : leafText ? (typeof leafText === "function" ? leafText(node) : leafText)
                        : node.type.spec.leafText ? node.type.spec.leafText(node)
                            : "";
            if (node.isBlock && (node.isLeaf && nodeText || node.isTextblock) && blockSeparator) {
                if (first)
                    first = false;
                else
                    text += blockSeparator;
            }
            text += nodeText;
        }, 0);
        return text;
    }
    /**
    Create a new fragment containing the combined content of this
    fragment and the other.
    */
    append(other) {
        if (!other.size)
            return this;
        if (!this.size)
            return other;
        let last = this.lastChild, first = other.firstChild, content = this.content.slice(), i = 0;
        if (last.isText && last.sameMarkup(first)) {
            content[content.length - 1] = last.withText(last.text + first.text);
            i = 1;
        }
        for (; i < other.content.length; i++)
            content.push(other.content[i]);
        return new Fragment(content, this.size + other.size);
    }
    /**
    Cut out the sub-fragment between the two given positions.
    */
    cut(from, to = this.size) {
        if (from == 0 && to == this.size)
            return this;
        let result = [], size = 0;
        if (to > from)
            for (let i = 0, pos = 0; pos < to; i++) {
                let child = this.content[i], end = pos + child.nodeSize;
                if (end > from) {
                    if (pos < from || end > to) {
                        if (child.isText)
                            child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
                        else
                            child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
                    }
                    result.push(child);
                    size += child.nodeSize;
                }
                pos = end;
            }
        return new Fragment(result, size);
    }
    /**
    @internal
    */
    cutByIndex(from, to) {
        if (from == to)
            return Fragment.empty;
        if (from == 0 && to == this.content.length)
            return this;
        return new Fragment(this.content.slice(from, to));
    }
    /**
    Create a new fragment in which the node at the given index is
    replaced by the given node.
    */
    replaceChild(index, node) {
        let current = this.content[index];
        if (current == node)
            return this;
        let copy = this.content.slice();
        let size = this.size + node.nodeSize - current.nodeSize;
        copy[index] = node;
        return new Fragment(copy, size);
    }
    /**
    Create a new fragment by prepending the given node to this
    fragment.
    */
    addToStart(node) {
        return new Fragment([node].concat(this.content), this.size + node.nodeSize);
    }
    /**
    Create a new fragment by appending the given node to this
    fragment.
    */
    addToEnd(node) {
        return new Fragment(this.content.concat(node), this.size + node.nodeSize);
    }
    /**
    Compare this fragment to another one.
    */
    eq(other) {
        if (this.content.length != other.content.length)
            return false;
        for (let i = 0; i < this.content.length; i++)
            if (!this.content[i].eq(other.content[i]))
                return false;
        return true;
    }
    /**
    The first child of the fragment, or `null` if it is empty.
    */
    get firstChild() { return this.content.length ? this.content[0] : null; }
    /**
    The last child of the fragment, or `null` if it is empty.
    */
    get lastChild() { return this.content.length ? this.content[this.content.length - 1] : null; }
    /**
    The number of child nodes in this fragment.
    */
    get childCount() { return this.content.length; }
    /**
    Get the child node at the given index. Raise an error when the
    index is out of range.
    */
    child(index) {
        let found = this.content[index];
        if (!found)
            throw new RangeError("Index " + index + " out of range for " + this);
        return found;
    }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) {
        return this.content[index] || null;
    }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) {
        for (let i = 0, p = 0; i < this.content.length; i++) {
            let child = this.content[i];
            f(child, p, i);
            p += child.nodeSize;
        }
    }
    /**
    Find the first position at which this fragment and another
    fragment differ, or `null` if they are the same.
    */
    findDiffStart(other, pos = 0) {
        return findDiffStart$1(this, other, pos);
    }
    /**
    Find the first position, searching from the end, at which this
    fragment and the given fragment differ, or `null` if they are
    the same. Since this position will not be the same in both
    nodes, an object with two separate positions is returned.
    */
    findDiffEnd(other, pos = this.size, otherPos = other.size) {
        return findDiffEnd$1(this, other, pos, otherPos);
    }
    /**
    Find the index and inner offset corresponding to a given relative
    position in this fragment. The result object will be reused
    (overwritten) the next time the function is called. @internal
    */
    findIndex(pos) {
        if (pos == 0)
            return retIndex$1(0, pos);
        if (pos == this.size)
            return retIndex$1(this.content.length, pos);
        if (pos > this.size || pos < 0)
            throw new RangeError(`Position ${pos} outside of fragment (${this})`);
        for (let i = 0, curPos = 0;; i++) {
            let cur = this.child(i), end = curPos + cur.nodeSize;
            if (end >= pos) {
                if (end == pos)
                    return retIndex$1(i + 1, end);
                return retIndex$1(i, curPos);
            }
            curPos = end;
        }
    }
    /**
    Return a debugging string that describes this fragment.
    */
    toString() { return "<" + this.toStringInner() + ">"; }
    /**
    @internal
    */
    toStringInner() { return this.content.join(", "); }
    /**
    Create a JSON-serializeable representation of this fragment.
    */
    toJSON() {
        return this.content.length ? this.content.map(n => n.toJSON()) : null;
    }
    /**
    Deserialize a fragment from its JSON representation.
    */
    static fromJSON(schema, value) {
        if (!value)
            return Fragment.empty;
        if (!Array.isArray(value))
            throw new RangeError("Invalid input for Fragment.fromJSON");
        return Fragment.fromArray(value.map(schema.nodeFromJSON));
    }
    /**
    Build a fragment from an array of nodes. Ensures that adjacent
    text nodes with the same marks are joined together.
    */
    static fromArray(array) {
        if (!array.length)
            return Fragment.empty;
        let joined, size = 0;
        for (let i = 0; i < array.length; i++) {
            let node = array[i];
            size += node.nodeSize;
            if (i && node.isText && array[i - 1].sameMarkup(node)) {
                if (!joined)
                    joined = array.slice(0, i);
                joined[joined.length - 1] = node
                    .withText(joined[joined.length - 1].text + node.text);
            }
            else if (joined) {
                joined.push(node);
            }
        }
        return new Fragment(joined || array, size);
    }
    /**
    Create a fragment from something that can be interpreted as a
    set of nodes. For `null`, it returns the empty fragment. For a
    fragment, the fragment itself. For a node or array of nodes, a
    fragment containing those nodes.
    */
    static from(nodes) {
        if (!nodes)
            return Fragment.empty;
        if (nodes instanceof Fragment)
            return nodes;
        if (Array.isArray(nodes))
            return this.fromArray(nodes);
        if (nodes.attrs)
            return new Fragment([nodes], nodes.nodeSize);
        throw new RangeError("Can not convert " + nodes + " to a Fragment" +
            (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""));
    }
};
/**
An empty fragment. Intended to be reused whenever a node doesn't
contain anything (rather than allocating a new empty fragment for
each leaf node).
*/
Fragment$1.empty = new Fragment$1([], 0);
const found$1 = { index: 0, offset: 0 };
function retIndex$1(index, offset) {
    found$1.index = index;
    found$1.offset = offset;
    return found$1;
}

function compareDeep$1(a, b) {
    if (a === b)
        return true;
    if (!(a && typeof a == "object") ||
        !(b && typeof b == "object"))
        return false;
    let array = Array.isArray(a);
    if (Array.isArray(b) != array)
        return false;
    if (array) {
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!compareDeep$1(a[i], b[i]))
                return false;
    }
    else {
        for (let p in a)
            if (!(p in b) || !compareDeep$1(a[p], b[p]))
                return false;
        for (let p in b)
            if (!(p in a))
                return false;
    }
    return true;
}

/**
A mark is a piece of information that can be attached to a node,
such as it being emphasized, in code font, or a link. It has a
type and optionally a set of attributes that provide further
information (such as the target of the link). Marks are created
through a `Schema`, which controls which types exist and which
attributes they have.
*/
let Mark$1 = class Mark {
    /**
    @internal
    */
    constructor(
    /**
    The type of this mark.
    */
    type, 
    /**
    The attributes associated with this mark.
    */
    attrs) {
        this.type = type;
        this.attrs = attrs;
    }
    /**
    Given a set of marks, create a new set which contains this one as
    well, in the right position. If this mark is already in the set,
    the set itself is returned. If any marks that are set to be
    [exclusive](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) with this mark are present,
    those are replaced by this one.
    */
    addToSet(set) {
        let copy, placed = false;
        for (let i = 0; i < set.length; i++) {
            let other = set[i];
            if (this.eq(other))
                return set;
            if (this.type.excludes(other.type)) {
                if (!copy)
                    copy = set.slice(0, i);
            }
            else if (other.type.excludes(this.type)) {
                return set;
            }
            else {
                if (!placed && other.type.rank > this.type.rank) {
                    if (!copy)
                        copy = set.slice(0, i);
                    copy.push(this);
                    placed = true;
                }
                if (copy)
                    copy.push(other);
            }
        }
        if (!copy)
            copy = set.slice();
        if (!placed)
            copy.push(this);
        return copy;
    }
    /**
    Remove this mark from the given set, returning a new set. If this
    mark is not in the set, the set itself is returned.
    */
    removeFromSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return set.slice(0, i).concat(set.slice(i + 1));
        return set;
    }
    /**
    Test whether this mark is in the given set of marks.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return true;
        return false;
    }
    /**
    Test whether this mark has the same type and attributes as
    another mark.
    */
    eq(other) {
        return this == other ||
            (this.type == other.type && compareDeep$1(this.attrs, other.attrs));
    }
    /**
    Convert this mark to a JSON-serializeable representation.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        return obj;
    }
    /**
    Deserialize a mark from JSON.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Mark.fromJSON");
        let type = schema.marks[json.type];
        if (!type)
            throw new RangeError(`There is no mark type ${json.type} in this schema`);
        let mark = type.create(json.attrs);
        type.checkAttrs(mark.attrs);
        return mark;
    }
    /**
    Test whether two sets of marks are identical.
    */
    static sameSet(a, b) {
        if (a == b)
            return true;
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!a[i].eq(b[i]))
                return false;
        return true;
    }
    /**
    Create a properly sorted mark set from null, a single mark, or an
    unsorted array of marks.
    */
    static setFrom(marks) {
        if (!marks || Array.isArray(marks) && marks.length == 0)
            return Mark.none;
        if (marks instanceof Mark)
            return [marks];
        let copy = marks.slice();
        copy.sort((a, b) => a.type.rank - b.type.rank);
        return copy;
    }
};
/**
The empty set of marks.
*/
Mark$1.none = [];

/**
Error type raised by [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) when
given an invalid replacement.
*/
let ReplaceError$1 = class ReplaceError extends Error {
};
/**
A slice represents a piece cut out of a larger document. It
stores not only a fragment, but also the depth up to which nodes on
both side are ‘open’ (cut through).
*/
let Slice$1 = class Slice {
    /**
    Create a slice. When specifying a non-zero open depth, you must
    make sure that there are nodes of at least that depth at the
    appropriate side of the fragment—i.e. if the fragment is an
    empty paragraph node, `openStart` and `openEnd` can't be greater
    than 1.
    
    It is not necessary for the content of open nodes to conform to
    the schema's content constraints, though it should be a valid
    start/end/middle for such a node, depending on which sides are
    open.
    */
    constructor(
    /**
    The slice's content.
    */
    content, 
    /**
    The open depth at the start of the fragment.
    */
    openStart, 
    /**
    The open depth at the end.
    */
    openEnd) {
        this.content = content;
        this.openStart = openStart;
        this.openEnd = openEnd;
    }
    /**
    The size this slice would add when inserted into a document.
    */
    get size() {
        return this.content.size - this.openStart - this.openEnd;
    }
    /**
    @internal
    */
    insertAt(pos, fragment) {
        let content = insertInto$1(this.content, pos + this.openStart, fragment, this.openStart + 1, this.openEnd + 1);
        return content && new Slice(content, this.openStart, this.openEnd);
    }
    /**
    @internal
    */
    removeBetween(from, to) {
        return new Slice(removeRange$1(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd);
    }
    /**
    Tests whether this slice is equal to another slice.
    */
    eq(other) {
        return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd;
    }
    /**
    @internal
    */
    toString() {
        return this.content + "(" + this.openStart + "," + this.openEnd + ")";
    }
    /**
    Convert a slice to a JSON-serializable representation.
    */
    toJSON() {
        if (!this.content.size)
            return null;
        let json = { content: this.content.toJSON() };
        if (this.openStart > 0)
            json.openStart = this.openStart;
        if (this.openEnd > 0)
            json.openEnd = this.openEnd;
        return json;
    }
    /**
    Deserialize a slice from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            return Slice.empty;
        let openStart = json.openStart || 0, openEnd = json.openEnd || 0;
        if (typeof openStart != "number" || typeof openEnd != "number")
            throw new RangeError("Invalid input for Slice.fromJSON");
        return new Slice(Fragment$1.fromJSON(schema, json.content), openStart, openEnd);
    }
    /**
    Create a slice from a fragment by taking the maximum possible
    open value on both side of the fragment.
    */
    static maxOpen(fragment, openIsolating = true) {
        let openStart = 0, openEnd = 0;
        for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild)
            openStart++;
        for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild)
            openEnd++;
        return new Slice(fragment, openStart, openEnd);
    }
};
/**
The empty slice.
*/
Slice$1.empty = new Slice$1(Fragment$1.empty, 0, 0);
function removeRange$1(content, from, to) {
    let { index, offset } = content.findIndex(from), child = content.maybeChild(index);
    let { index: indexTo, offset: offsetTo } = content.findIndex(to);
    if (offset == from || child.isText) {
        if (offsetTo != to && !content.child(indexTo).isText)
            throw new RangeError("Removing non-flat range");
        return content.cut(0, from).append(content.cut(to));
    }
    if (index != indexTo)
        throw new RangeError("Removing non-flat range");
    return content.replaceChild(index, child.copy(removeRange$1(child.content, from - offset - 1, to - offset - 1)));
}
function insertInto$1(content, dist, insert, openStart, openEnd, parent) {
    let { index, offset } = content.findIndex(dist), child = content.maybeChild(index);
    if (offset == dist || child.isText) {
        if (parent && openStart <= 0 && openEnd <= 0 && !parent.canReplace(index, index, insert))
            return null;
        return content.cut(0, dist).append(insert).append(content.cut(dist));
    }
    let inner = insertInto$1(child.content, dist - offset - 1, insert, index == 0 ? openStart - 1 : 0, index == content.childCount - 1 ? openEnd - 1 : 0, child);
    return inner && content.replaceChild(index, child.copy(inner));
}
function replace$2($from, $to, slice) {
    if (slice.openStart > $from.depth)
        throw new ReplaceError$1("Inserted content deeper than insertion position");
    if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
        throw new ReplaceError$1("Inconsistent open depths");
    return replaceOuter$1($from, $to, slice, 0);
}
function replaceOuter$1($from, $to, slice, depth) {
    let index = $from.index(depth), node = $from.node(depth);
    if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
        let inner = replaceOuter$1($from, $to, slice, depth + 1);
        return node.copy(node.content.replaceChild(index, inner));
    }
    else if (!slice.content.size) {
        return close$1(node, replaceTwoWay$1($from, $to, depth));
    }
    else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
        let parent = $from.parent, content = parent.content;
        return close$1(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)));
    }
    else {
        let { start, end } = prepareSliceForReplace$1(slice, $from);
        return close$1(node, replaceThreeWay$1($from, start, end, $to, depth));
    }
}
function checkJoin$1(main, sub) {
    if (!sub.type.compatibleContent(main.type))
        throw new ReplaceError$1("Cannot join " + sub.type.name + " onto " + main.type.name);
}
function joinable$1($before, $after, depth) {
    let node = $before.node(depth);
    checkJoin$1(node, $after.node(depth));
    return node;
}
function addNode$1(child, target) {
    let last = target.length - 1;
    if (last >= 0 && child.isText && child.sameMarkup(target[last]))
        target[last] = child.withText(target[last].text + child.text);
    else
        target.push(child);
}
function addRange$1($start, $end, depth, target) {
    let node = ($end || $start).node(depth);
    let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount;
    if ($start) {
        startIndex = $start.index(depth);
        if ($start.depth > depth) {
            startIndex++;
        }
        else if ($start.textOffset) {
            addNode$1($start.nodeAfter, target);
            startIndex++;
        }
    }
    for (let i = startIndex; i < endIndex; i++)
        addNode$1(node.child(i), target);
    if ($end && $end.depth == depth && $end.textOffset)
        addNode$1($end.nodeBefore, target);
}
function close$1(node, content) {
    node.type.checkContent(content);
    return node.copy(content);
}
function replaceThreeWay$1($from, $start, $end, $to, depth) {
    let openStart = $from.depth > depth && joinable$1($from, $start, depth + 1);
    let openEnd = $to.depth > depth && joinable$1($end, $to, depth + 1);
    let content = [];
    addRange$1(null, $from, depth, content);
    if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
        checkJoin$1(openStart, openEnd);
        addNode$1(close$1(openStart, replaceThreeWay$1($from, $start, $end, $to, depth + 1)), content);
    }
    else {
        if (openStart)
            addNode$1(close$1(openStart, replaceTwoWay$1($from, $start, depth + 1)), content);
        addRange$1($start, $end, depth, content);
        if (openEnd)
            addNode$1(close$1(openEnd, replaceTwoWay$1($end, $to, depth + 1)), content);
    }
    addRange$1($to, null, depth, content);
    return new Fragment$1(content);
}
function replaceTwoWay$1($from, $to, depth) {
    let content = [];
    addRange$1(null, $from, depth, content);
    if ($from.depth > depth) {
        let type = joinable$1($from, $to, depth + 1);
        addNode$1(close$1(type, replaceTwoWay$1($from, $to, depth + 1)), content);
    }
    addRange$1($to, null, depth, content);
    return new Fragment$1(content);
}
function prepareSliceForReplace$1(slice, $along) {
    let extra = $along.depth - slice.openStart, parent = $along.node(extra);
    let node = parent.copy(slice.content);
    for (let i = extra - 1; i >= 0; i--)
        node = $along.node(i).copy(Fragment$1.from(node));
    return { start: node.resolveNoCache(slice.openStart + extra),
        end: node.resolveNoCache(node.content.size - slice.openEnd - extra) };
}

/**
You can [_resolve_](https://prosemirror.net/docs/ref/#model.Node.resolve) a position to get more
information about it. Objects of this class represent such a
resolved position, providing various pieces of context
information, and some helper methods.

Throughout this interface, methods that take an optional `depth`
parameter will interpret undefined as `this.depth` and negative
numbers as `this.depth + value`.
*/
let ResolvedPos$1 = class ResolvedPos {
    /**
    @internal
    */
    constructor(
    /**
    The position that was resolved.
    */
    pos, 
    /**
    @internal
    */
    path, 
    /**
    The offset this position has into its parent node.
    */
    parentOffset) {
        this.pos = pos;
        this.path = path;
        this.parentOffset = parentOffset;
        this.depth = path.length / 3 - 1;
    }
    /**
    @internal
    */
    resolveDepth(val) {
        if (val == null)
            return this.depth;
        if (val < 0)
            return this.depth + val;
        return val;
    }
    /**
    The parent node that the position points into. Note that even if
    a position points into a text node, that node is not considered
    the parent—text nodes are ‘flat’ in this model, and have no content.
    */
    get parent() { return this.node(this.depth); }
    /**
    The root node in which the position was resolved.
    */
    get doc() { return this.node(0); }
    /**
    The ancestor node at the given level. `p.node(p.depth)` is the
    same as `p.parent`.
    */
    node(depth) { return this.path[this.resolveDepth(depth) * 3]; }
    /**
    The index into the ancestor at the given level. If this points
    at the 3rd node in the 2nd paragraph on the top level, for
    example, `p.index(0)` is 1 and `p.index(1)` is 2.
    */
    index(depth) { return this.path[this.resolveDepth(depth) * 3 + 1]; }
    /**
    The index pointing after this position into the ancestor at the
    given level.
    */
    indexAfter(depth) {
        depth = this.resolveDepth(depth);
        return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1);
    }
    /**
    The (absolute) position at the start of the node at the given
    level.
    */
    start(depth) {
        depth = this.resolveDepth(depth);
        return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
    }
    /**
    The (absolute) position at the end of the node at the given
    level.
    */
    end(depth) {
        depth = this.resolveDepth(depth);
        return this.start(depth) + this.node(depth).content.size;
    }
    /**
    The (absolute) position directly before the wrapping node at the
    given level, or, when `depth` is `this.depth + 1`, the original
    position.
    */
    before(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position before the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1];
    }
    /**
    The (absolute) position directly after the wrapping node at the
    given level, or the original position when `depth` is `this.depth + 1`.
    */
    after(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position after the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize;
    }
    /**
    When this position points into a text node, this returns the
    distance between the position and the start of the text node.
    Will be zero for positions that point between nodes.
    */
    get textOffset() { return this.pos - this.path[this.path.length - 1]; }
    /**
    Get the node directly after the position, if any. If the position
    points into a text node, only the part of that node after the
    position is returned.
    */
    get nodeAfter() {
        let parent = this.parent, index = this.index(this.depth);
        if (index == parent.childCount)
            return null;
        let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index);
        return dOff ? parent.child(index).cut(dOff) : child;
    }
    /**
    Get the node directly before the position, if any. If the
    position points into a text node, only the part of that node
    before the position is returned.
    */
    get nodeBefore() {
        let index = this.index(this.depth);
        let dOff = this.pos - this.path[this.path.length - 1];
        if (dOff)
            return this.parent.child(index).cut(0, dOff);
        return index == 0 ? null : this.parent.child(index - 1);
    }
    /**
    Get the position at the given index in the parent node at the
    given depth (which defaults to `this.depth`).
    */
    posAtIndex(index, depth) {
        depth = this.resolveDepth(depth);
        let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
        for (let i = 0; i < index; i++)
            pos += node.child(i).nodeSize;
        return pos;
    }
    /**
    Get the marks at this position, factoring in the surrounding
    marks' [`inclusive`](https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive) property. If the
    position is at the start of a non-empty node, the marks of the
    node after it (if any) are returned.
    */
    marks() {
        let parent = this.parent, index = this.index();
        // In an empty parent, return the empty array
        if (parent.content.size == 0)
            return Mark$1.none;
        // When inside a text node, just return the text node's marks
        if (this.textOffset)
            return parent.child(index).marks;
        let main = parent.maybeChild(index - 1), other = parent.maybeChild(index);
        // If the `after` flag is true of there is no node before, make
        // the node after this position the main reference.
        if (!main) {
            let tmp = main;
            main = other;
            other = tmp;
        }
        // Use all marks in the main node, except those that have
        // `inclusive` set to false and are not present in the other node.
        let marks = main.marks;
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    Get the marks after the current position, if any, except those
    that are non-inclusive and not present at position `$end`. This
    is mostly useful for getting the set of marks to preserve after a
    deletion. Will return `null` if this position is at the end of
    its parent node or its parent node isn't a textblock (in which
    case no marks should be preserved).
    */
    marksAcross($end) {
        let after = this.parent.maybeChild(this.index());
        if (!after || !after.isInline)
            return null;
        let marks = after.marks, next = $end.parent.maybeChild($end.index());
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    The depth up to which this position and the given (non-resolved)
    position share the same parent nodes.
    */
    sharedDepth(pos) {
        for (let depth = this.depth; depth > 0; depth--)
            if (this.start(depth) <= pos && this.end(depth) >= pos)
                return depth;
        return 0;
    }
    /**
    Returns a range based on the place where this position and the
    given position diverge around block content. If both point into
    the same textblock, for example, a range around that textblock
    will be returned. If they point into different blocks, the range
    around those blocks in their shared ancestor is returned. You can
    pass in an optional predicate that will be called with a parent
    node to see if a range into that parent is acceptable.
    */
    blockRange(other = this, pred) {
        if (other.pos < this.pos)
            return other.blockRange(this);
        for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
            if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
                return new NodeRange$1(this, other, d);
        return null;
    }
    /**
    Query whether the given position shares the same parent node.
    */
    sameParent(other) {
        return this.pos - this.parentOffset == other.pos - other.parentOffset;
    }
    /**
    Return the greater of this and the given position.
    */
    max(other) {
        return other.pos > this.pos ? other : this;
    }
    /**
    Return the smaller of this and the given position.
    */
    min(other) {
        return other.pos < this.pos ? other : this;
    }
    /**
    @internal
    */
    toString() {
        let str = "";
        for (let i = 1; i <= this.depth; i++)
            str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1);
        return str + ":" + this.parentOffset;
    }
    /**
    @internal
    */
    static resolve(doc, pos) {
        if (!(pos >= 0 && pos <= doc.content.size))
            throw new RangeError("Position " + pos + " out of range");
        let path = [];
        let start = 0, parentOffset = pos;
        for (let node = doc;;) {
            let { index, offset } = node.content.findIndex(parentOffset);
            let rem = parentOffset - offset;
            path.push(node, index, start + offset);
            if (!rem)
                break;
            node = node.child(index);
            if (node.isText)
                break;
            parentOffset = rem - 1;
            start += offset + 1;
        }
        return new ResolvedPos(pos, path, parentOffset);
    }
    /**
    @internal
    */
    static resolveCached(doc, pos) {
        let cache = resolveCache$1.get(doc);
        if (cache) {
            for (let i = 0; i < cache.elts.length; i++) {
                let elt = cache.elts[i];
                if (elt.pos == pos)
                    return elt;
            }
        }
        else {
            resolveCache$1.set(doc, cache = new ResolveCache$1);
        }
        let result = cache.elts[cache.i] = ResolvedPos.resolve(doc, pos);
        cache.i = (cache.i + 1) % resolveCacheSize$1;
        return result;
    }
};
let ResolveCache$1 = class ResolveCache {
    constructor() {
        this.elts = [];
        this.i = 0;
    }
};
const resolveCacheSize$1 = 12, resolveCache$1 = new WeakMap();
/**
Represents a flat range of content, i.e. one that starts and
ends in the same node.
*/
let NodeRange$1 = class NodeRange {
    /**
    Construct a node range. `$from` and `$to` should point into the
    same node until at least the given `depth`, since a node range
    denotes an adjacent set of nodes in a single parent node.
    */
    constructor(
    /**
    A resolved position along the start of the content. May have a
    `depth` greater than this object's `depth` property, since
    these are the positions that were used to compute the range,
    not re-resolved positions directly at its boundaries.
    */
    $from, 
    /**
    A position along the end of the content. See
    caveat for [`$from`](https://prosemirror.net/docs/ref/#model.NodeRange.$from).
    */
    $to, 
    /**
    The depth of the node that this range points into.
    */
    depth) {
        this.$from = $from;
        this.$to = $to;
        this.depth = depth;
    }
    /**
    The position at the start of the range.
    */
    get start() { return this.$from.before(this.depth + 1); }
    /**
    The position at the end of the range.
    */
    get end() { return this.$to.after(this.depth + 1); }
    /**
    The parent node that the range points into.
    */
    get parent() { return this.$from.node(this.depth); }
    /**
    The start index of the range in the parent node.
    */
    get startIndex() { return this.$from.index(this.depth); }
    /**
    The end index of the range in the parent node.
    */
    get endIndex() { return this.$to.indexAfter(this.depth); }
};

const emptyAttrs$1 = Object.create(null);
/**
This class represents a node in the tree that makes up a
ProseMirror document. So a document is an instance of `Node`, with
children that are also instances of `Node`.

Nodes are persistent data structures. Instead of changing them, you
create new ones with the content you want. Old ones keep pointing
at the old document shape. This is made cheaper by sharing
structure between the old and new data as much as possible, which a
tree shape like this (without back pointers) makes easy.

**Do not** directly mutate the properties of a `Node` object. See
[the guide](https://prosemirror.net/docs/guide/#doc) for more information.
*/
let Node$1 = class Node {
    /**
    @internal
    */
    constructor(
    /**
    The type of node that this is.
    */
    type, 
    /**
    An object mapping attribute names to values. The kind of
    attributes allowed and required are
    [determined](https://prosemirror.net/docs/ref/#model.NodeSpec.attrs) by the node type.
    */
    attrs, 
    // A fragment holding the node's children.
    content, 
    /**
    The marks (things like whether it is emphasized or part of a
    link) applied to this node.
    */
    marks = Mark$1.none) {
        this.type = type;
        this.attrs = attrs;
        this.marks = marks;
        this.content = content || Fragment$1.empty;
    }
    /**
    The array of this node's child nodes.
    */
    get children() { return this.content.content; }
    /**
    The size of this node, as defined by the integer-based [indexing
    scheme](https://prosemirror.net/docs/guide/#doc.indexing). For text nodes, this is the
    amount of characters. For other leaf nodes, it is one. For
    non-leaf nodes, it is the size of the content plus two (the
    start and end token).
    */
    get nodeSize() { return this.isLeaf ? 1 : 2 + this.content.size; }
    /**
    The number of children that the node has.
    */
    get childCount() { return this.content.childCount; }
    /**
    Get the child node at the given index. Raises an error when the
    index is out of range.
    */
    child(index) { return this.content.child(index); }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) { return this.content.maybeChild(index); }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) { this.content.forEach(f); }
    /**
    Invoke a callback for all descendant nodes recursively overlapping
    the given two positions that are relative to start of this
    node's content. This includes all ancestors of the nodes
    containing the two positions. The callback is invoked with the
    node, its position relative to the original node (method receiver),
    its parent node, and its child index. When the callback returns
    false for a given node, that node's children will not be
    recursed over. The last parameter can be used to specify a
    starting position to count from.
    */
    nodesBetween(from, to, f, startPos = 0) {
        this.content.nodesBetween(from, to, f, startPos, this);
    }
    /**
    Call the given callback for every descendant node. Doesn't
    descend into a node when the callback returns `false`.
    */
    descendants(f) {
        this.nodesBetween(0, this.content.size, f);
    }
    /**
    Concatenates all the text nodes found in this fragment and its
    children.
    */
    get textContent() {
        return (this.isLeaf && this.type.spec.leafText)
            ? this.type.spec.leafText(this)
            : this.textBetween(0, this.content.size, "");
    }
    /**
    Get all text between positions `from` and `to`. When
    `blockSeparator` is given, it will be inserted to separate text
    from different block nodes. If `leafText` is given, it'll be
    inserted for every non-text leaf node encountered, otherwise
    [`leafText`](https://prosemirror.net/docs/ref/#model.NodeSpec.leafText) will be used.
    */
    textBetween(from, to, blockSeparator, leafText) {
        return this.content.textBetween(from, to, blockSeparator, leafText);
    }
    /**
    Returns this node's first child, or `null` if there are no
    children.
    */
    get firstChild() { return this.content.firstChild; }
    /**
    Returns this node's last child, or `null` if there are no
    children.
    */
    get lastChild() { return this.content.lastChild; }
    /**
    Test whether two nodes represent the same piece of document.
    */
    eq(other) {
        return this == other || (this.sameMarkup(other) && this.content.eq(other.content));
    }
    /**
    Compare the markup (type, attributes, and marks) of this node to
    those of another. Returns `true` if both have the same markup.
    */
    sameMarkup(other) {
        return this.hasMarkup(other.type, other.attrs, other.marks);
    }
    /**
    Check whether this node's markup correspond to the given type,
    attributes, and marks.
    */
    hasMarkup(type, attrs, marks) {
        return this.type == type &&
            compareDeep$1(this.attrs, attrs || type.defaultAttrs || emptyAttrs$1) &&
            Mark$1.sameSet(this.marks, marks || Mark$1.none);
    }
    /**
    Create a new node with the same markup as this node, containing
    the given content (or empty, if no content is given).
    */
    copy(content = null) {
        if (content == this.content)
            return this;
        return new Node(this.type, this.attrs, content, this.marks);
    }
    /**
    Create a copy of this node, with the given set of marks instead
    of the node's own marks.
    */
    mark(marks) {
        return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks);
    }
    /**
    Create a copy of this node with only the content between the
    given positions. If `to` is not given, it defaults to the end of
    the node.
    */
    cut(from, to = this.content.size) {
        if (from == 0 && to == this.content.size)
            return this;
        return this.copy(this.content.cut(from, to));
    }
    /**
    Cut out the part of the document between the given positions, and
    return it as a `Slice` object.
    */
    slice(from, to = this.content.size, includeParents = false) {
        if (from == to)
            return Slice$1.empty;
        let $from = this.resolve(from), $to = this.resolve(to);
        let depth = includeParents ? 0 : $from.sharedDepth(to);
        let start = $from.start(depth), node = $from.node(depth);
        let content = node.content.cut($from.pos - start, $to.pos - start);
        return new Slice$1(content, $from.depth - depth, $to.depth - depth);
    }
    /**
    Replace the part of the document between the given positions with
    the given slice. The slice must 'fit', meaning its open sides
    must be able to connect to the surrounding content, and its
    content nodes must be valid children for the node they are placed
    into. If any of this is violated, an error of type
    [`ReplaceError`](https://prosemirror.net/docs/ref/#model.ReplaceError) is thrown.
    */
    replace(from, to, slice) {
        return replace$2(this.resolve(from), this.resolve(to), slice);
    }
    /**
    Find the node directly after the given position.
    */
    nodeAt(pos) {
        for (let node = this;;) {
            let { index, offset } = node.content.findIndex(pos);
            node = node.maybeChild(index);
            if (!node)
                return null;
            if (offset == pos || node.isText)
                return node;
            pos -= offset + 1;
        }
    }
    /**
    Find the (direct) child node after the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childAfter(pos) {
        let { index, offset } = this.content.findIndex(pos);
        return { node: this.content.maybeChild(index), index, offset };
    }
    /**
    Find the (direct) child node before the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childBefore(pos) {
        if (pos == 0)
            return { node: null, index: 0, offset: 0 };
        let { index, offset } = this.content.findIndex(pos);
        if (offset < pos)
            return { node: this.content.child(index), index, offset };
        let node = this.content.child(index - 1);
        return { node, index: index - 1, offset: offset - node.nodeSize };
    }
    /**
    Resolve the given position in the document, returning an
    [object](https://prosemirror.net/docs/ref/#model.ResolvedPos) with information about its context.
    */
    resolve(pos) { return ResolvedPos$1.resolveCached(this, pos); }
    /**
    @internal
    */
    resolveNoCache(pos) { return ResolvedPos$1.resolve(this, pos); }
    /**
    Test whether a given mark or mark type occurs in this document
    between the two given positions.
    */
    rangeHasMark(from, to, type) {
        let found = false;
        if (to > from)
            this.nodesBetween(from, to, node => {
                if (type.isInSet(node.marks))
                    found = true;
                return !found;
            });
        return found;
    }
    /**
    True when this is a block (non-inline node)
    */
    get isBlock() { return this.type.isBlock; }
    /**
    True when this is a textblock node, a block node with inline
    content.
    */
    get isTextblock() { return this.type.isTextblock; }
    /**
    True when this node allows inline content.
    */
    get inlineContent() { return this.type.inlineContent; }
    /**
    True when this is an inline node (a text node or a node that can
    appear among text).
    */
    get isInline() { return this.type.isInline; }
    /**
    True when this is a text node.
    */
    get isText() { return this.type.isText; }
    /**
    True when this is a leaf node.
    */
    get isLeaf() { return this.type.isLeaf; }
    /**
    True when this is an atom, i.e. when it does not have directly
    editable content. This is usually the same as `isLeaf`, but can
    be configured with the [`atom` property](https://prosemirror.net/docs/ref/#model.NodeSpec.atom)
    on a node's spec (typically used when the node is displayed as
    an uneditable [node view](https://prosemirror.net/docs/ref/#view.NodeView)).
    */
    get isAtom() { return this.type.isAtom; }
    /**
    Return a string representation of this node for debugging
    purposes.
    */
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        let name = this.type.name;
        if (this.content.size)
            name += "(" + this.content.toStringInner() + ")";
        return wrapMarks$1(this.marks, name);
    }
    /**
    Get the content match in this node at the given index.
    */
    contentMatchAt(index) {
        let match = this.type.contentMatch.matchFragment(this.content, 0, index);
        if (!match)
            throw new Error("Called contentMatchAt on a node with invalid content");
        return match;
    }
    /**
    Test whether replacing the range between `from` and `to` (by
    child index) with the given replacement fragment (which defaults
    to the empty fragment) would leave the node's content valid. You
    can optionally pass `start` and `end` indices into the
    replacement fragment.
    */
    canReplace(from, to, replacement = Fragment$1.empty, start = 0, end = replacement.childCount) {
        let one = this.contentMatchAt(from).matchFragment(replacement, start, end);
        let two = one && one.matchFragment(this.content, to);
        if (!two || !two.validEnd)
            return false;
        for (let i = start; i < end; i++)
            if (!this.type.allowsMarks(replacement.child(i).marks))
                return false;
        return true;
    }
    /**
    Test whether replacing the range `from` to `to` (by index) with
    a node of the given type would leave the node's content valid.
    */
    canReplaceWith(from, to, type, marks) {
        if (marks && !this.type.allowsMarks(marks))
            return false;
        let start = this.contentMatchAt(from).matchType(type);
        let end = start && start.matchFragment(this.content, to);
        return end ? end.validEnd : false;
    }
    /**
    Test whether the given node's content could be appended to this
    node. If that node is empty, this will only return true if there
    is at least one node type that can appear in both nodes (to avoid
    merging completely incompatible nodes).
    */
    canAppend(other) {
        if (other.content.size)
            return this.canReplace(this.childCount, this.childCount, other.content);
        else
            return this.type.compatibleContent(other.type);
    }
    /**
    Check whether this node and its descendants conform to the
    schema, and raise an exception when they do not.
    */
    check() {
        this.type.checkContent(this.content);
        this.type.checkAttrs(this.attrs);
        let copy = Mark$1.none;
        for (let i = 0; i < this.marks.length; i++) {
            let mark = this.marks[i];
            mark.type.checkAttrs(mark.attrs);
            copy = mark.addToSet(copy);
        }
        if (!Mark$1.sameSet(copy, this.marks))
            throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`);
        this.content.forEach(node => node.check());
    }
    /**
    Return a JSON-serializeable representation of this node.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        if (this.content.size)
            obj.content = this.content.toJSON();
        if (this.marks.length)
            obj.marks = this.marks.map(n => n.toJSON());
        return obj;
    }
    /**
    Deserialize a node from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Node.fromJSON");
        let marks = undefined;
        if (json.marks) {
            if (!Array.isArray(json.marks))
                throw new RangeError("Invalid mark data for Node.fromJSON");
            marks = json.marks.map(schema.markFromJSON);
        }
        if (json.type == "text") {
            if (typeof json.text != "string")
                throw new RangeError("Invalid text node in JSON");
            return schema.text(json.text, marks);
        }
        let content = Fragment$1.fromJSON(schema, json.content);
        let node = schema.nodeType(json.type).create(json.attrs, content, marks);
        node.type.checkAttrs(node.attrs);
        return node;
    }
};
Node$1.prototype.text = undefined;
let TextNode$1 = class TextNode extends Node$1 {
    /**
    @internal
    */
    constructor(type, attrs, content, marks) {
        super(type, attrs, null, marks);
        if (!content)
            throw new RangeError("Empty text nodes are not allowed");
        this.text = content;
    }
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        return wrapMarks$1(this.marks, JSON.stringify(this.text));
    }
    get textContent() { return this.text; }
    textBetween(from, to) { return this.text.slice(from, to); }
    get nodeSize() { return this.text.length; }
    mark(marks) {
        return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks);
    }
    withText(text) {
        if (text == this.text)
            return this;
        return new TextNode(this.type, this.attrs, text, this.marks);
    }
    cut(from = 0, to = this.text.length) {
        if (from == 0 && to == this.text.length)
            return this;
        return this.withText(this.text.slice(from, to));
    }
    eq(other) {
        return this.sameMarkup(other) && this.text == other.text;
    }
    toJSON() {
        let base = super.toJSON();
        base.text = this.text;
        return base;
    }
};
function wrapMarks$1(marks, str) {
    for (let i = marks.length - 1; i >= 0; i--)
        str = marks[i].type.name + "(" + str + ")";
    return str;
}

/**
Instances of this class represent a match state of a node type's
[content expression](https://prosemirror.net/docs/ref/#model.NodeSpec.content), and can be used to
find out whether further content matches here, and whether a given
position is a valid end of the node.
*/
let ContentMatch$1 = class ContentMatch {
    /**
    @internal
    */
    constructor(
    /**
    True when this match state represents a valid end of the node.
    */
    validEnd) {
        this.validEnd = validEnd;
        /**
        @internal
        */
        this.next = [];
        /**
        @internal
        */
        this.wrapCache = [];
    }
    /**
    @internal
    */
    static parse(string, nodeTypes) {
        let stream = new TokenStream$1(string, nodeTypes);
        if (stream.next == null)
            return ContentMatch.empty;
        let expr = parseExpr$1(stream);
        if (stream.next)
            stream.err("Unexpected trailing text");
        let match = dfa$1(nfa$1(expr));
        checkForDeadEnds$1(match, stream);
        return match;
    }
    /**
    Match a node type, returning a match after that node if
    successful.
    */
    matchType(type) {
        for (let i = 0; i < this.next.length; i++)
            if (this.next[i].type == type)
                return this.next[i].next;
        return null;
    }
    /**
    Try to match a fragment. Returns the resulting match when
    successful.
    */
    matchFragment(frag, start = 0, end = frag.childCount) {
        let cur = this;
        for (let i = start; cur && i < end; i++)
            cur = cur.matchType(frag.child(i).type);
        return cur;
    }
    /**
    @internal
    */
    get inlineContent() {
        return this.next.length != 0 && this.next[0].type.isInline;
    }
    /**
    Get the first matching node type at this match position that can
    be generated.
    */
    get defaultType() {
        for (let i = 0; i < this.next.length; i++) {
            let { type } = this.next[i];
            if (!(type.isText || type.hasRequiredAttrs()))
                return type;
        }
        return null;
    }
    /**
    @internal
    */
    compatible(other) {
        for (let i = 0; i < this.next.length; i++)
            for (let j = 0; j < other.next.length; j++)
                if (this.next[i].type == other.next[j].type)
                    return true;
        return false;
    }
    /**
    Try to match the given fragment, and if that fails, see if it can
    be made to match by inserting nodes in front of it. When
    successful, return a fragment of inserted nodes (which may be
    empty if nothing had to be inserted). When `toEnd` is true, only
    return a fragment if the resulting match goes to the end of the
    content expression.
    */
    fillBefore(after, toEnd = false, startIndex = 0) {
        let seen = [this];
        function search(match, types) {
            let finished = match.matchFragment(after, startIndex);
            if (finished && (!toEnd || finished.validEnd))
                return Fragment$1.from(types.map(tp => tp.createAndFill()));
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
                    seen.push(next);
                    let found = search(next, types.concat(type));
                    if (found)
                        return found;
                }
            }
            return null;
        }
        return search(this, []);
    }
    /**
    Find a set of wrapping node types that would allow a node of the
    given type to appear at this position. The result may be empty
    (when it fits directly) and will be null when no such wrapping
    exists.
    */
    findWrapping(target) {
        for (let i = 0; i < this.wrapCache.length; i += 2)
            if (this.wrapCache[i] == target)
                return this.wrapCache[i + 1];
        let computed = this.computeWrapping(target);
        this.wrapCache.push(target, computed);
        return computed;
    }
    /**
    @internal
    */
    computeWrapping(target) {
        let seen = Object.create(null), active = [{ match: this, type: null, via: null }];
        while (active.length) {
            let current = active.shift(), match = current.match;
            if (match.matchType(target)) {
                let result = [];
                for (let obj = current; obj.type; obj = obj.via)
                    result.push(obj.type);
                return result.reverse();
            }
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
                    active.push({ match: type.contentMatch, type, via: current });
                    seen[type.name] = true;
                }
            }
        }
        return null;
    }
    /**
    The number of outgoing edges this node has in the finite
    automaton that describes the content expression.
    */
    get edgeCount() {
        return this.next.length;
    }
    /**
    Get the _n_​th outgoing edge from this node in the finite
    automaton that describes the content expression.
    */
    edge(n) {
        if (n >= this.next.length)
            throw new RangeError(`There's no ${n}th edge in this content match`);
        return this.next[n];
    }
    /**
    @internal
    */
    toString() {
        let seen = [];
        function scan(m) {
            seen.push(m);
            for (let i = 0; i < m.next.length; i++)
                if (seen.indexOf(m.next[i].next) == -1)
                    scan(m.next[i].next);
        }
        scan(this);
        return seen.map((m, i) => {
            let out = i + (m.validEnd ? "*" : " ") + " ";
            for (let i = 0; i < m.next.length; i++)
                out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next);
            return out;
        }).join("\n");
    }
};
/**
@internal
*/
ContentMatch$1.empty = new ContentMatch$1(true);
let TokenStream$1 = class TokenStream {
    constructor(string, nodeTypes) {
        this.string = string;
        this.nodeTypes = nodeTypes;
        this.inline = null;
        this.pos = 0;
        this.tokens = string.split(/\s*(?=\b|\W|$)/);
        if (this.tokens[this.tokens.length - 1] == "")
            this.tokens.pop();
        if (this.tokens[0] == "")
            this.tokens.shift();
    }
    get next() { return this.tokens[this.pos]; }
    eat(tok) { return this.next == tok && (this.pos++ || true); }
    err(str) { throw new SyntaxError(str + " (in content expression '" + this.string + "')"); }
};
function parseExpr$1(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSeq$1(stream));
    } while (stream.eat("|"));
    return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
}
function parseExprSeq$1(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSubscript$1(stream));
    } while (stream.next && stream.next != ")" && stream.next != "|");
    return exprs.length == 1 ? exprs[0] : { type: "seq", exprs };
}
function parseExprSubscript$1(stream) {
    let expr = parseExprAtom$1(stream);
    for (;;) {
        if (stream.eat("+"))
            expr = { type: "plus", expr };
        else if (stream.eat("*"))
            expr = { type: "star", expr };
        else if (stream.eat("?"))
            expr = { type: "opt", expr };
        else if (stream.eat("{"))
            expr = parseExprRange$1(stream, expr);
        else
            break;
    }
    return expr;
}
function parseNum$1(stream) {
    if (/\D/.test(stream.next))
        stream.err("Expected number, got '" + stream.next + "'");
    let result = Number(stream.next);
    stream.pos++;
    return result;
}
function parseExprRange$1(stream, expr) {
    let min = parseNum$1(stream), max = min;
    if (stream.eat(",")) {
        if (stream.next != "}")
            max = parseNum$1(stream);
        else
            max = -1;
    }
    if (!stream.eat("}"))
        stream.err("Unclosed braced range");
    return { type: "range", min, max, expr };
}
function resolveName$1(stream, name) {
    let types = stream.nodeTypes, type = types[name];
    if (type)
        return [type];
    let result = [];
    for (let typeName in types) {
        let type = types[typeName];
        if (type.isInGroup(name))
            result.push(type);
    }
    if (result.length == 0)
        stream.err("No node type or group '" + name + "' found");
    return result;
}
function parseExprAtom$1(stream) {
    if (stream.eat("(")) {
        let expr = parseExpr$1(stream);
        if (!stream.eat(")"))
            stream.err("Missing closing paren");
        return expr;
    }
    else if (!/\W/.test(stream.next)) {
        let exprs = resolveName$1(stream, stream.next).map(type => {
            if (stream.inline == null)
                stream.inline = type.isInline;
            else if (stream.inline != type.isInline)
                stream.err("Mixing inline and block content");
            return { type: "name", value: type };
        });
        stream.pos++;
        return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
    }
    else {
        stream.err("Unexpected token '" + stream.next + "'");
    }
}
// Construct an NFA from an expression as returned by the parser. The
// NFA is represented as an array of states, which are themselves
// arrays of edges, which are `{term, to}` objects. The first state is
// the entry state and the last node is the success state.
//
// Note that unlike typical NFAs, the edge ordering in this one is
// significant, in that it is used to contruct filler content when
// necessary.
function nfa$1(expr) {
    let nfa = [[]];
    connect(compile(expr, 0), node());
    return nfa;
    function node() { return nfa.push([]) - 1; }
    function edge(from, to, term) {
        let edge = { term, to };
        nfa[from].push(edge);
        return edge;
    }
    function connect(edges, to) {
        edges.forEach(edge => edge.to = to);
    }
    function compile(expr, from) {
        if (expr.type == "choice") {
            return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), []);
        }
        else if (expr.type == "seq") {
            for (let i = 0;; i++) {
                let next = compile(expr.exprs[i], from);
                if (i == expr.exprs.length - 1)
                    return next;
                connect(next, from = node());
            }
        }
        else if (expr.type == "star") {
            let loop = node();
            edge(from, loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "plus") {
            let loop = node();
            connect(compile(expr.expr, from), loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "opt") {
            return [edge(from)].concat(compile(expr.expr, from));
        }
        else if (expr.type == "range") {
            let cur = from;
            for (let i = 0; i < expr.min; i++) {
                let next = node();
                connect(compile(expr.expr, cur), next);
                cur = next;
            }
            if (expr.max == -1) {
                connect(compile(expr.expr, cur), cur);
            }
            else {
                for (let i = expr.min; i < expr.max; i++) {
                    let next = node();
                    edge(cur, next);
                    connect(compile(expr.expr, cur), next);
                    cur = next;
                }
            }
            return [edge(cur)];
        }
        else if (expr.type == "name") {
            return [edge(from, undefined, expr.value)];
        }
        else {
            throw new Error("Unknown expr type");
        }
    }
}
function cmp$1(a, b) { return b - a; }
// Get the set of nodes reachable by null edges from `node`. Omit
// nodes with only a single null-out-edge, since they may lead to
// needless duplicated nodes.
function nullFrom$1(nfa, node) {
    let result = [];
    scan(node);
    return result.sort(cmp$1);
    function scan(node) {
        let edges = nfa[node];
        if (edges.length == 1 && !edges[0].term)
            return scan(edges[0].to);
        result.push(node);
        for (let i = 0; i < edges.length; i++) {
            let { term, to } = edges[i];
            if (!term && result.indexOf(to) == -1)
                scan(to);
        }
    }
}
// Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
// of state objects (`ContentMatch` instances) with transitions
// between them.
function dfa$1(nfa) {
    let labeled = Object.create(null);
    return explore(nullFrom$1(nfa, 0));
    function explore(states) {
        let out = [];
        states.forEach(node => {
            nfa[node].forEach(({ term, to }) => {
                if (!term)
                    return;
                let set;
                for (let i = 0; i < out.length; i++)
                    if (out[i][0] == term)
                        set = out[i][1];
                nullFrom$1(nfa, to).forEach(node => {
                    if (!set)
                        out.push([term, set = []]);
                    if (set.indexOf(node) == -1)
                        set.push(node);
                });
            });
        });
        let state = labeled[states.join(",")] = new ContentMatch$1(states.indexOf(nfa.length - 1) > -1);
        for (let i = 0; i < out.length; i++) {
            let states = out[i][1].sort(cmp$1);
            state.next.push({ type: out[i][0], next: labeled[states.join(",")] || explore(states) });
        }
        return state;
    }
}
function checkForDeadEnds$1(match, stream) {
    for (let i = 0, work = [match]; i < work.length; i++) {
        let state = work[i], dead = !state.validEnd, nodes = [];
        for (let j = 0; j < state.next.length; j++) {
            let { type, next } = state.next[j];
            nodes.push(type.name);
            if (dead && !(type.isText || type.hasRequiredAttrs()))
                dead = false;
            if (work.indexOf(next) == -1)
                work.push(next);
        }
        if (dead)
            stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)");
    }
}

// For node types where all attrs have a default value (or which don't
// have any attributes), build up a single reusable default attribute
// object, and use it for all nodes that don't specify specific
// attributes.
function defaultAttrs$1(attrs) {
    let defaults = Object.create(null);
    for (let attrName in attrs) {
        let attr = attrs[attrName];
        if (!attr.hasDefault)
            return null;
        defaults[attrName] = attr.default;
    }
    return defaults;
}
function computeAttrs$1(attrs, value) {
    let built = Object.create(null);
    for (let name in attrs) {
        let given = value && value[name];
        if (given === undefined) {
            let attr = attrs[name];
            if (attr.hasDefault)
                given = attr.default;
            else
                throw new RangeError("No value supplied for attribute " + name);
        }
        built[name] = given;
    }
    return built;
}
function checkAttrs$1(attrs, values, type, name) {
    for (let name in values)
        if (!(name in attrs))
            throw new RangeError(`Unsupported attribute ${name} for ${type} of type ${name}`);
    for (let name in attrs) {
        let attr = attrs[name];
        if (attr.validate)
            attr.validate(values[name]);
    }
}
function initAttrs$1(typeName, attrs) {
    let result = Object.create(null);
    if (attrs)
        for (let name in attrs)
            result[name] = new Attribute$1(typeName, name, attrs[name]);
    return result;
}
/**
Node types are objects allocated once per `Schema` and used to
[tag](https://prosemirror.net/docs/ref/#model.Node.type) `Node` instances. They contain information
about the node type, such as its name and what kind of node it
represents.
*/
let NodeType$1 = class NodeType {
    /**
    @internal
    */
    constructor(
    /**
    The name the node type has in this schema.
    */
    name, 
    /**
    A link back to the `Schema` the node type belongs to.
    */
    schema, 
    /**
    The spec that this type is based on
    */
    spec) {
        this.name = name;
        this.schema = schema;
        this.spec = spec;
        /**
        The set of marks allowed in this node. `null` means all marks
        are allowed.
        */
        this.markSet = null;
        this.groups = spec.group ? spec.group.split(" ") : [];
        this.attrs = initAttrs$1(name, spec.attrs);
        this.defaultAttrs = defaultAttrs$1(this.attrs);
        this.contentMatch = null;
        this.inlineContent = null;
        this.isBlock = !(spec.inline || name == "text");
        this.isText = name == "text";
    }
    /**
    True if this is an inline type.
    */
    get isInline() { return !this.isBlock; }
    /**
    True if this is a textblock type, a block that contains inline
    content.
    */
    get isTextblock() { return this.isBlock && this.inlineContent; }
    /**
    True for node types that allow no content.
    */
    get isLeaf() { return this.contentMatch == ContentMatch$1.empty; }
    /**
    True when this node is an atom, i.e. when it does not have
    directly editable content.
    */
    get isAtom() { return this.isLeaf || !!this.spec.atom; }
    /**
    Return true when this node type is part of the given
    [group](https://prosemirror.net/docs/ref/#model.NodeSpec.group).
    */
    isInGroup(group) {
        return this.groups.indexOf(group) > -1;
    }
    /**
    The node type's [whitespace](https://prosemirror.net/docs/ref/#model.NodeSpec.whitespace) option.
    */
    get whitespace() {
        return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
    }
    /**
    Tells you whether this node type has any required attributes.
    */
    hasRequiredAttrs() {
        for (let n in this.attrs)
            if (this.attrs[n].isRequired)
                return true;
        return false;
    }
    /**
    Indicates whether this node allows some of the same content as
    the given node type.
    */
    compatibleContent(other) {
        return this == other || this.contentMatch.compatible(other.contentMatch);
    }
    /**
    @internal
    */
    computeAttrs(attrs) {
        if (!attrs && this.defaultAttrs)
            return this.defaultAttrs;
        else
            return computeAttrs$1(this.attrs, attrs);
    }
    /**
    Create a `Node` of this type. The given attributes are
    checked and defaulted (you can pass `null` to use the type's
    defaults entirely, if no required attributes exist). `content`
    may be a `Fragment`, a node, an array of nodes, or
    `null`. Similarly `marks` may be `null` to default to the empty
    set of marks.
    */
    create(attrs = null, content, marks) {
        if (this.isText)
            throw new Error("NodeType.create can't construct text nodes");
        return new Node$1(this, this.computeAttrs(attrs), Fragment$1.from(content), Mark$1.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but check the given content
    against the node type's content restrictions, and throw an error
    if it doesn't match.
    */
    createChecked(attrs = null, content, marks) {
        content = Fragment$1.from(content);
        this.checkContent(content);
        return new Node$1(this, this.computeAttrs(attrs), content, Mark$1.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but see if it is
    necessary to add nodes to the start or end of the given fragment
    to make it fit the node. If no fitting wrapping can be found,
    return null. Note that, due to the fact that required nodes can
    always be created, this will always succeed if you pass null or
    `Fragment.empty` as content.
    */
    createAndFill(attrs = null, content, marks) {
        attrs = this.computeAttrs(attrs);
        content = Fragment$1.from(content);
        if (content.size) {
            let before = this.contentMatch.fillBefore(content);
            if (!before)
                return null;
            content = before.append(content);
        }
        let matched = this.contentMatch.matchFragment(content);
        let after = matched && matched.fillBefore(Fragment$1.empty, true);
        if (!after)
            return null;
        return new Node$1(this, attrs, content.append(after), Mark$1.setFrom(marks));
    }
    /**
    Returns true if the given fragment is valid content for this node
    type.
    */
    validContent(content) {
        let result = this.contentMatch.matchFragment(content);
        if (!result || !result.validEnd)
            return false;
        for (let i = 0; i < content.childCount; i++)
            if (!this.allowsMarks(content.child(i).marks))
                return false;
        return true;
    }
    /**
    Throws a RangeError if the given fragment is not valid content for this
    node type.
    @internal
    */
    checkContent(content) {
        if (!this.validContent(content))
            throw new RangeError(`Invalid content for node ${this.name}: ${content.toString().slice(0, 50)}`);
    }
    /**
    @internal
    */
    checkAttrs(attrs) {
        checkAttrs$1(this.attrs, attrs, "node", this.name);
    }
    /**
    Check whether the given mark type is allowed in this node.
    */
    allowsMarkType(markType) {
        return this.markSet == null || this.markSet.indexOf(markType) > -1;
    }
    /**
    Test whether the given set of marks are allowed in this node.
    */
    allowsMarks(marks) {
        if (this.markSet == null)
            return true;
        for (let i = 0; i < marks.length; i++)
            if (!this.allowsMarkType(marks[i].type))
                return false;
        return true;
    }
    /**
    Removes the marks that are not allowed in this node from the given set.
    */
    allowedMarks(marks) {
        if (this.markSet == null)
            return marks;
        let copy;
        for (let i = 0; i < marks.length; i++) {
            if (!this.allowsMarkType(marks[i].type)) {
                if (!copy)
                    copy = marks.slice(0, i);
            }
            else if (copy) {
                copy.push(marks[i]);
            }
        }
        return !copy ? marks : copy.length ? copy : Mark$1.none;
    }
    /**
    @internal
    */
    static compile(nodes, schema) {
        let result = Object.create(null);
        nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec));
        let topType = schema.spec.topNode || "doc";
        if (!result[topType])
            throw new RangeError("Schema is missing its top node type ('" + topType + "')");
        if (!result.text)
            throw new RangeError("Every schema needs a 'text' type");
        for (let _ in result.text.attrs)
            throw new RangeError("The text node type should not have attributes");
        return result;
    }
};
function validateType$1(typeName, attrName, type) {
    let types = type.split("|");
    return (value) => {
        let name = value === null ? "null" : typeof value;
        if (types.indexOf(name) < 0)
            throw new RangeError(`Expected value of type ${types} for attribute ${attrName} on type ${typeName}, got ${name}`);
    };
}
// Attribute descriptors
let Attribute$1 = class Attribute {
    constructor(typeName, attrName, options) {
        this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
        this.default = options.default;
        this.validate = typeof options.validate == "string" ? validateType$1(typeName, attrName, options.validate) : options.validate;
    }
    get isRequired() {
        return !this.hasDefault;
    }
};
// Marks
/**
Like nodes, marks (which are associated with nodes to signify
things like emphasis or being part of a link) are
[tagged](https://prosemirror.net/docs/ref/#model.Mark.type) with type objects, which are
instantiated once per `Schema`.
*/
let MarkType$1 = class MarkType {
    /**
    @internal
    */
    constructor(
    /**
    The name of the mark type.
    */
    name, 
    /**
    @internal
    */
    rank, 
    /**
    The schema that this mark type instance is part of.
    */
    schema, 
    /**
    The spec on which the type is based.
    */
    spec) {
        this.name = name;
        this.rank = rank;
        this.schema = schema;
        this.spec = spec;
        this.attrs = initAttrs$1(name, spec.attrs);
        this.excluded = null;
        let defaults = defaultAttrs$1(this.attrs);
        this.instance = defaults ? new Mark$1(this, defaults) : null;
    }
    /**
    Create a mark of this type. `attrs` may be `null` or an object
    containing only some of the mark's attributes. The others, if
    they have defaults, will be added.
    */
    create(attrs = null) {
        if (!attrs && this.instance)
            return this.instance;
        return new Mark$1(this, computeAttrs$1(this.attrs, attrs));
    }
    /**
    @internal
    */
    static compile(marks, schema) {
        let result = Object.create(null), rank = 0;
        marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec));
        return result;
    }
    /**
    When there is a mark of this type in the given set, a new set
    without it is returned. Otherwise, the input set is returned.
    */
    removeFromSet(set) {
        for (var i = 0; i < set.length; i++)
            if (set[i].type == this) {
                set = set.slice(0, i).concat(set.slice(i + 1));
                i--;
            }
        return set;
    }
    /**
    Tests whether there is a mark of this type in the given set.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (set[i].type == this)
                return set[i];
    }
    /**
    @internal
    */
    checkAttrs(attrs) {
        checkAttrs$1(this.attrs, attrs, "mark", this.name);
    }
    /**
    Queries whether a given mark type is
    [excluded](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) by this one.
    */
    excludes(other) {
        return this.excluded.indexOf(other) > -1;
    }
};
/**
A document schema. Holds [node](https://prosemirror.net/docs/ref/#model.NodeType) and [mark
type](https://prosemirror.net/docs/ref/#model.MarkType) objects for the nodes and marks that may
occur in conforming documents, and provides functionality for
creating and deserializing such documents.

When given, the type parameters provide the names of the nodes and
marks in this schema.
*/
let Schema$1 = class Schema {
    /**
    Construct a schema from a schema [specification](https://prosemirror.net/docs/ref/#model.SchemaSpec).
    */
    constructor(spec) {
        /**
        The [linebreak
        replacement](https://prosemirror.net/docs/ref/#model.NodeSpec.linebreakReplacement) node defined
        in this schema, if any.
        */
        this.linebreakReplacement = null;
        /**
        An object for storing whatever values modules may want to
        compute and cache per schema. (If you want to store something
        in it, try to use property names unlikely to clash.)
        */
        this.cached = Object.create(null);
        let instanceSpec = this.spec = {};
        for (let prop in spec)
            instanceSpec[prop] = spec[prop];
        instanceSpec.nodes = OrderedMap$1.from(spec.nodes),
            instanceSpec.marks = OrderedMap$1.from(spec.marks || {}),
            this.nodes = NodeType$1.compile(this.spec.nodes, this);
        this.marks = MarkType$1.compile(this.spec.marks, this);
        let contentExprCache = Object.create(null);
        for (let prop in this.nodes) {
            if (prop in this.marks)
                throw new RangeError(prop + " can not be both a node and a mark");
            let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks;
            type.contentMatch = contentExprCache[contentExpr] ||
                (contentExprCache[contentExpr] = ContentMatch$1.parse(contentExpr, this.nodes));
            type.inlineContent = type.contentMatch.inlineContent;
            if (type.spec.linebreakReplacement) {
                if (this.linebreakReplacement)
                    throw new RangeError("Multiple linebreak nodes defined");
                if (!type.isInline || !type.isLeaf)
                    throw new RangeError("Linebreak replacement nodes must be inline leaf nodes");
                this.linebreakReplacement = type;
            }
            type.markSet = markExpr == "_" ? null :
                markExpr ? gatherMarks$1(this, markExpr.split(" ")) :
                    markExpr == "" || !type.inlineContent ? [] : null;
        }
        for (let prop in this.marks) {
            let type = this.marks[prop], excl = type.spec.excludes;
            type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks$1(this, excl.split(" "));
        }
        this.nodeFromJSON = json => Node$1.fromJSON(this, json);
        this.markFromJSON = json => Mark$1.fromJSON(this, json);
        this.topNodeType = this.nodes[this.spec.topNode || "doc"];
        this.cached.wrappings = Object.create(null);
    }
    /**
    Create a node in this schema. The `type` may be a string or a
    `NodeType` instance. Attributes will be extended with defaults,
    `content` may be a `Fragment`, `null`, a `Node`, or an array of
    nodes.
    */
    node(type, attrs = null, content, marks) {
        if (typeof type == "string")
            type = this.nodeType(type);
        else if (!(type instanceof NodeType$1))
            throw new RangeError("Invalid node type: " + type);
        else if (type.schema != this)
            throw new RangeError("Node type from different schema used (" + type.name + ")");
        return type.createChecked(attrs, content, marks);
    }
    /**
    Create a text node in the schema. Empty text nodes are not
    allowed.
    */
    text(text, marks) {
        let type = this.nodes.text;
        return new TextNode$1(type, type.defaultAttrs, text, Mark$1.setFrom(marks));
    }
    /**
    Create a mark with the given type and attributes.
    */
    mark(type, attrs) {
        if (typeof type == "string")
            type = this.marks[type];
        return type.create(attrs);
    }
    /**
    @internal
    */
    nodeType(name) {
        let found = this.nodes[name];
        if (!found)
            throw new RangeError("Unknown node type: " + name);
        return found;
    }
};
function gatherMarks$1(schema, marks) {
    let found = [];
    for (let i = 0; i < marks.length; i++) {
        let name = marks[i], mark = schema.marks[name], ok = mark;
        if (mark) {
            found.push(mark);
        }
        else {
            for (let prop in schema.marks) {
                let mark = schema.marks[prop];
                if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
                    found.push(ok = mark);
            }
        }
        if (!ok)
            throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
    }
    return found;
}

/**
A DOM serializer knows how to convert ProseMirror nodes and
marks of various types to DOM nodes.
*/
class DOMSerializer {
    /**
    Create a serializer. `nodes` should map node names to functions
    that take a node and return a description of the corresponding
    DOM. `marks` does the same for mark names, but also gets an
    argument that tells it whether the mark's content is block or
    inline content (for typical use, it'll always be inline). A mark
    serializer may be `null` to indicate that marks of that type
    should not be serialized.
    */
    constructor(
    /**
    The node serialization functions.
    */
    nodes, 
    /**
    The mark serialization functions.
    */
    marks) {
        this.nodes = nodes;
        this.marks = marks;
    }
    /**
    Serialize the content of this fragment to a DOM fragment. When
    not in the browser, the `document` option, containing a DOM
    document, should be passed so that the serializer can create
    nodes.
    */
    serializeFragment(fragment, options = {}, target) {
        if (!target)
            target = doc(options).createDocumentFragment();
        let top = target, active = [];
        fragment.forEach(node => {
            if (active.length || node.marks.length) {
                let keep = 0, rendered = 0;
                while (keep < active.length && rendered < node.marks.length) {
                    let next = node.marks[rendered];
                    if (!this.marks[next.type.name]) {
                        rendered++;
                        continue;
                    }
                    if (!next.eq(active[keep][0]) || next.type.spec.spanning === false)
                        break;
                    keep++;
                    rendered++;
                }
                while (keep < active.length)
                    top = active.pop()[1];
                while (rendered < node.marks.length) {
                    let add = node.marks[rendered++];
                    let markDOM = this.serializeMark(add, node.isInline, options);
                    if (markDOM) {
                        active.push([add, top]);
                        top.appendChild(markDOM.dom);
                        top = markDOM.contentDOM || markDOM.dom;
                    }
                }
            }
            top.appendChild(this.serializeNodeInner(node, options));
        });
        return target;
    }
    /**
    @internal
    */
    serializeNodeInner(node, options) {
        if (node.isText)
            return doc(options).createTextNode(node.text);
        let { dom, contentDOM } = renderSpec(doc(options), this.nodes[node.type.name](node), null, node.attrs);
        if (contentDOM) {
            if (node.isLeaf)
                throw new RangeError("Content hole not allowed in a leaf node spec");
            this.serializeFragment(node.content, options, contentDOM);
        }
        return dom;
    }
    /**
    Serialize this node to a DOM node. This can be useful when you
    need to serialize a part of a document, as opposed to the whole
    document. To serialize a whole document, use
    [`serializeFragment`](https://prosemirror.net/docs/ref/#model.DOMSerializer.serializeFragment) on
    its [content](https://prosemirror.net/docs/ref/#model.Node.content).
    */
    serializeNode(node, options = {}) {
        let dom = this.serializeNodeInner(node, options);
        for (let i = node.marks.length - 1; i >= 0; i--) {
            let wrap = this.serializeMark(node.marks[i], node.isInline, options);
            if (wrap) {
                (wrap.contentDOM || wrap.dom).appendChild(dom);
                dom = wrap.dom;
            }
        }
        return dom;
    }
    /**
    @internal
    */
    serializeMark(mark, inline, options = {}) {
        let toDOM = this.marks[mark.type.name];
        return toDOM && renderSpec(doc(options), toDOM(mark, inline), null, mark.attrs);
    }
    static renderSpec(doc, structure, xmlNS = null, blockArraysIn) {
        // Kludge for backwards-compatibility with accidental original behavious
        if (typeof structure == "string")
            return { dom: doc.createTextNode(structure) };
        return renderSpec(doc, structure, xmlNS, blockArraysIn);
    }
    /**
    Build a serializer using the [`toDOM`](https://prosemirror.net/docs/ref/#model.NodeSpec.toDOM)
    properties in a schema's node and mark specs.
    */
    static fromSchema(schema) {
        return schema.cached.domSerializer ||
            (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)));
    }
    /**
    Gather the serializers in a schema's node specs into an object.
    This can be useful as a base to build a custom serializer from.
    */
    static nodesFromSchema(schema) {
        let result = gatherToDOM(schema.nodes);
        if (!result.text)
            result.text = node => node.text;
        return result;
    }
    /**
    Gather the serializers in a schema's mark specs into an object.
    */
    static marksFromSchema(schema) {
        return gatherToDOM(schema.marks);
    }
}
function gatherToDOM(obj) {
    let result = {};
    for (let name in obj) {
        let toDOM = obj[name].spec.toDOM;
        if (toDOM)
            result[name] = toDOM;
    }
    return result;
}
function doc(options) {
    return options.document || window.document;
}
const suspiciousAttributeCache = new WeakMap();
function suspiciousAttributes(attrs) {
    let value = suspiciousAttributeCache.get(attrs);
    if (value === undefined)
        suspiciousAttributeCache.set(attrs, value = suspiciousAttributesInner(attrs));
    return value;
}
function suspiciousAttributesInner(attrs) {
    let result = null;
    function scan(value) {
        if (value && typeof value == "object") {
            if (Array.isArray(value)) {
                if (typeof value[0] == "string") {
                    if (!result)
                        result = [];
                    result.push(value);
                }
                else {
                    for (let i = 0; i < value.length; i++)
                        scan(value[i]);
                }
            }
            else {
                for (let prop in value)
                    scan(value[prop]);
            }
        }
    }
    scan(attrs);
    return result;
}
function renderSpec(doc, structure, xmlNS, blockArraysIn) {
    if (structure.nodeType == 1)
        return { dom: structure };
    if (structure.dom && structure.dom.nodeType == 1)
        return structure;
    let tagName = structure[0], suspicious;
    if (typeof tagName != "string")
        throw new RangeError("Invalid array passed to renderSpec");
    if (blockArraysIn && (suspicious = suspiciousAttributes(blockArraysIn)) &&
        suspicious.indexOf(structure) > -1)
        throw new RangeError("Using an array from an attribute object as a DOM spec. This may be an attempted cross site scripting attack.");
    let space = tagName.indexOf(" ");
    if (space > 0) {
        xmlNS = tagName.slice(0, space);
        tagName = tagName.slice(space + 1);
    }
    let contentDOM;
    let dom = (xmlNS ? doc.createElementNS(xmlNS, tagName) : doc.createElement(tagName));
    let attrs = structure[1], start = 1;
    if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
        start = 2;
        for (let name in attrs)
            if (attrs[name] != null) {
                let space = name.indexOf(" ");
                if (space > 0)
                    dom.setAttributeNS(name.slice(0, space), name.slice(space + 1), attrs[name]);
                else if (name == "style" && dom.style)
                    dom.style.cssText = attrs[name];
                else
                    dom.setAttribute(name, attrs[name]);
            }
    }
    for (let i = start; i < structure.length; i++) {
        let child = structure[i];
        if (child === 0) {
            if (i < structure.length - 1 || i > start)
                throw new RangeError("Content hole must be the only child of its parent node");
            return { dom, contentDOM: dom };
        }
        else if (typeof child == "string") {
            dom.appendChild(doc.createTextNode(child));
        }
        else {
            let { dom: inner, contentDOM: innerContent } = renderSpec(doc, child, xmlNS, blockArraysIn);
            dom.appendChild(inner);
            if (innerContent) {
                if (contentDOM)
                    throw new RangeError("Multiple content holes");
                contentDOM = innerContent;
            }
        }
    }
    return { dom, contentDOM };
}

/* eslint-disable no-bitwise */

const decodeCache = {};

function getDecodeCache (exclude) {
  let cache = decodeCache[exclude];
  if (cache) { return cache }

  cache = decodeCache[exclude] = [];

  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    cache.push(ch);
  }

  for (let i = 0; i < exclude.length; i++) {
    const ch = exclude.charCodeAt(i);
    cache[ch] = '%' + ('0' + ch.toString(16).toUpperCase()).slice(-2);
  }

  return cache
}

// Decode percent-encoded string.
//
function decode$1 (string, exclude) {
  if (typeof exclude !== 'string') {
    exclude = decode$1.defaultChars;
  }

  const cache = getDecodeCache(exclude);

  return string.replace(/(%[a-f0-9]{2})+/gi, function (seq) {
    let result = '';

    for (let i = 0, l = seq.length; i < l; i += 3) {
      const b1 = parseInt(seq.slice(i + 1, i + 3), 16);

      if (b1 < 0x80) {
        result += cache[b1];
        continue
      }

      if ((b1 & 0xE0) === 0xC0 && (i + 3 < l)) {
        // 110xxxxx 10xxxxxx
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);

        if ((b2 & 0xC0) === 0x80) {
          const chr = ((b1 << 6) & 0x7C0) | (b2 & 0x3F);

          if (chr < 0x80) {
            result += '\ufffd\ufffd';
          } else {
            result += String.fromCharCode(chr);
          }

          i += 3;
          continue
        }
      }

      if ((b1 & 0xF0) === 0xE0 && (i + 6 < l)) {
        // 1110xxxx 10xxxxxx 10xxxxxx
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);

        if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
          const chr = ((b1 << 12) & 0xF000) | ((b2 << 6) & 0xFC0) | (b3 & 0x3F);

          if (chr < 0x800 || (chr >= 0xD800 && chr <= 0xDFFF)) {
            result += '\ufffd\ufffd\ufffd';
          } else {
            result += String.fromCharCode(chr);
          }

          i += 6;
          continue
        }
      }

      if ((b1 & 0xF8) === 0xF0 && (i + 9 < l)) {
        // 111110xx 10xxxxxx 10xxxxxx 10xxxxxx
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        const b4 = parseInt(seq.slice(i + 10, i + 12), 16);

        if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80 && (b4 & 0xC0) === 0x80) {
          let chr = ((b1 << 18) & 0x1C0000) | ((b2 << 12) & 0x3F000) | ((b3 << 6) & 0xFC0) | (b4 & 0x3F);

          if (chr < 0x10000 || chr > 0x10FFFF) {
            result += '\ufffd\ufffd\ufffd\ufffd';
          } else {
            chr -= 0x10000;
            result += String.fromCharCode(0xD800 + (chr >> 10), 0xDC00 + (chr & 0x3FF));
          }

          i += 9;
          continue
        }
      }

      result += '\ufffd';
    }

    return result
  })
}

decode$1.defaultChars = ';/?:@&=+$,#';
decode$1.componentChars = '';

const encodeCache = {};

// Create a lookup array where anything but characters in `chars` string
// and alphanumeric chars is percent-encoded.
//
function getEncodeCache (exclude) {
  let cache = encodeCache[exclude];
  if (cache) { return cache }

  cache = encodeCache[exclude] = [];

  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);

    if (/^[0-9a-z]$/i.test(ch)) {
      // always allow unencoded alphanumeric characters
      cache.push(ch);
    } else {
      cache.push('%' + ('0' + i.toString(16).toUpperCase()).slice(-2));
    }
  }

  for (let i = 0; i < exclude.length; i++) {
    cache[exclude.charCodeAt(i)] = exclude[i];
  }

  return cache
}

// Encode unsafe characters with percent-encoding, skipping already
// encoded sequences.
//
//  - string       - string to encode
//  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
//  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)
//
function encode$1 (string, exclude, keepEscaped) {
  if (typeof exclude !== 'string') {
    // encode(string, keepEscaped)
    keepEscaped = exclude;
    exclude = encode$1.defaultChars;
  }

  if (typeof keepEscaped === 'undefined') {
    keepEscaped = true;
  }

  const cache = getEncodeCache(exclude);
  let result = '';

  for (let i = 0, l = string.length; i < l; i++) {
    const code = string.charCodeAt(i);

    if (keepEscaped && code === 0x25 /* % */ && i + 2 < l) {
      if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
        result += string.slice(i, i + 3);
        i += 2;
        continue
      }
    }

    if (code < 128) {
      result += cache[code];
      continue
    }

    if (code >= 0xD800 && code <= 0xDFFF) {
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < l) {
        const nextCode = string.charCodeAt(i + 1);
        if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
          result += encodeURIComponent(string[i] + string[i + 1]);
          i++;
          continue
        }
      }
      result += '%EF%BF%BD';
      continue
    }

    result += encodeURIComponent(string[i]);
  }

  return result
}

encode$1.defaultChars = ";/?:@&=+$,-_.!~*'()#";
encode$1.componentChars = "-_.!~*'()";

function format (url) {
  let result = '';

  result += url.protocol || '';
  result += url.slashes ? '//' : '';
  result += url.auth ? url.auth + '@' : '';

  if (url.hostname && url.hostname.indexOf(':') !== -1) {
    // ipv6 address
    result += '[' + url.hostname + ']';
  } else {
    result += url.hostname || '';
  }

  result += url.port ? ':' + url.port : '';
  result += url.pathname || '';
  result += url.search || '';
  result += url.hash || '';

  return result
}

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

//
// Changes from joyent/node:
//
// 1. No leading slash in paths,
//    e.g. in `url.parse('http://foo?bar')` pathname is ``, not `/`
//
// 2. Backslashes are not replaced with slashes,
//    so `http:\\example.org\` is treated like a relative path
//
// 3. Trailing colon is treated like a part of the path,
//    i.e. in `http://example.org:foo` pathname is `:foo`
//
// 4. Nothing is URL-encoded in the resulting object,
//    (in joyent/node some chars in auth and paths are encoded)
//
// 5. `url.parse()` does not have `parseQueryString` argument
//
// 6. Removed extraneous result properties: `host`, `path`, `query`, etc.,
//    which can be constructed using other parts of the url.
//

function Url () {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.pathname = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/;

// Special case for a simple path URL
/* eslint-disable-next-line no-useless-escape */
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;

// RFC 2396: characters reserved for delimiting URLs.
// We actually just auto-escape these.
const delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'];

// RFC 2396: characters not allowed for various reasons.
const unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims);

// Allowed by RFCs, but cause of XSS attacks.  Always escape these.
const autoEscape = ['\''].concat(unwise);
// Characters that are never ever allowed in a hostname.
// Note that any invalid chars are also handled, but these
// are the ones that are *expected* to be seen, so we fast-path
// them.
const nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape);
const hostEndingChars = ['/', '?', '#'];
const hostnameMaxLen = 255;
const hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
const hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
// protocols that can allow "unsafe" and "unwise" chars.
// protocols that never have a hostname.
const hostlessProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that always contain a // bit.
const slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  'http:': true,
  'https:': true,
  'ftp:': true,
  'gopher:': true,
  'file:': true
};

function urlParse (url, slashesDenoteHost) {
  if (url && url instanceof Url) return url

  const u = new Url();
  u.parse(url, slashesDenoteHost);
  return u
}

Url.prototype.parse = function (url, slashesDenoteHost) {
  let lowerProto, hec, slashes;
  let rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
      }
      return this
    }
  }

  let proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = proto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  /* eslint-disable-next-line no-useless-escape */
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    let hostEnd = -1;
    for (let i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    let auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = auth;
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (let i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1) {
      hostEnd = rest.length;
    }

    if (rest[hostEnd - 1] === ':') { hostEnd--; }
    const host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost(host);

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    const ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      const hostparts = this.hostname.split(/\./);
      for (let i = 0, l = hostparts.length; i < l; i++) {
        const part = hostparts[i];
        if (!part) { continue }
        if (!part.match(hostnamePartPattern)) {
          let newpart = '';
          for (let j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            const validParts = hostparts.slice(0, i);
            const notHost = hostparts.slice(i + 1);
            const bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    }

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
    }
  }

  // chop off from the tail first.
  const hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  const qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    rest = rest.slice(0, qm);
  }
  if (rest) { this.pathname = rest; }
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '';
  }

  return this
};

Url.prototype.parseHost = function (host) {
  let port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) { this.hostname = host; }
};

var mdurl = /*#__PURE__*/Object.freeze({
  __proto__: null,
  decode: decode$1,
  encode: encode$1,
  format: format,
  parse: urlParse
});

var Any = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;

var Cc = /[\0-\x1F\x7F-\x9F]/;

var regex$1 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;

var P = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1B7D\u1B7E\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDEAD\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;

var regex = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2426\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E3\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBC2\uFD40-\uFD4F\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED7\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDF76\uDF7B-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0\uDCB1\uDD00-\uDE53\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC5\uDECE-\uDEDB\uDEE0-\uDEE8\uDEF0-\uDEF8\uDF00-\uDF92\uDF94-\uDFCA]/;

var Z = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

var ucmicro = /*#__PURE__*/Object.freeze({
  __proto__: null,
  Any: Any,
  Cc: Cc,
  Cf: regex$1,
  P: P,
  S: regex,
  Z: Z
});

// Generated using scripts/write-decode-map.ts
var htmlDecodeTree = new Uint16Array(
// prettier-ignore
"\u1d41<\xd5\u0131\u028a\u049d\u057b\u05d0\u0675\u06de\u07a2\u07d6\u080f\u0a4a\u0a91\u0da1\u0e6d\u0f09\u0f26\u10ca\u1228\u12e1\u1415\u149d\u14c3\u14df\u1525\0\0\0\0\0\0\u156b\u16cd\u198d\u1c12\u1ddd\u1f7e\u2060\u21b0\u228d\u23c0\u23fb\u2442\u2824\u2912\u2d08\u2e48\u2fce\u3016\u32ba\u3639\u37ac\u38fe\u3a28\u3a71\u3ae0\u3b2e\u0800EMabcfglmnoprstu\\bfms\x7f\x84\x8b\x90\x95\x98\xa6\xb3\xb9\xc8\xcflig\u803b\xc6\u40c6P\u803b&\u4026cute\u803b\xc1\u40c1reve;\u4102\u0100iyx}rc\u803b\xc2\u40c2;\u4410r;\uc000\ud835\udd04rave\u803b\xc0\u40c0pha;\u4391acr;\u4100d;\u6a53\u0100gp\x9d\xa1on;\u4104f;\uc000\ud835\udd38plyFunction;\u6061ing\u803b\xc5\u40c5\u0100cs\xbe\xc3r;\uc000\ud835\udc9cign;\u6254ilde\u803b\xc3\u40c3ml\u803b\xc4\u40c4\u0400aceforsu\xe5\xfb\xfe\u0117\u011c\u0122\u0127\u012a\u0100cr\xea\xf2kslash;\u6216\u0176\xf6\xf8;\u6ae7ed;\u6306y;\u4411\u0180crt\u0105\u010b\u0114ause;\u6235noullis;\u612ca;\u4392r;\uc000\ud835\udd05pf;\uc000\ud835\udd39eve;\u42d8c\xf2\u0113mpeq;\u624e\u0700HOacdefhilorsu\u014d\u0151\u0156\u0180\u019e\u01a2\u01b5\u01b7\u01ba\u01dc\u0215\u0273\u0278\u027ecy;\u4427PY\u803b\xa9\u40a9\u0180cpy\u015d\u0162\u017aute;\u4106\u0100;i\u0167\u0168\u62d2talDifferentialD;\u6145leys;\u612d\u0200aeio\u0189\u018e\u0194\u0198ron;\u410cdil\u803b\xc7\u40c7rc;\u4108nint;\u6230ot;\u410a\u0100dn\u01a7\u01adilla;\u40b8terDot;\u40b7\xf2\u017fi;\u43a7rcle\u0200DMPT\u01c7\u01cb\u01d1\u01d6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01e2\u01f8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020foubleQuote;\u601duote;\u6019\u0200lnpu\u021e\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6a74\u0180git\u022f\u0236\u023aruent;\u6261nt;\u622fourIntegral;\u622e\u0100fr\u024c\u024e;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6a2fcr;\uc000\ud835\udc9ep\u0100;C\u0284\u0285\u62d3ap;\u624d\u0580DJSZacefios\u02a0\u02ac\u02b0\u02b4\u02b8\u02cb\u02d7\u02e1\u02e6\u0333\u048d\u0100;o\u0179\u02a5trahd;\u6911cy;\u4402cy;\u4405cy;\u440f\u0180grs\u02bf\u02c4\u02c7ger;\u6021r;\u61a1hv;\u6ae4\u0100ay\u02d0\u02d5ron;\u410e;\u4414l\u0100;t\u02dd\u02de\u6207a;\u4394r;\uc000\ud835\udd07\u0100af\u02eb\u0327\u0100cm\u02f0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031ccute;\u40b4o\u0174\u030b\u030d;\u42d9bleAcute;\u42ddrave;\u4060ilde;\u42dcond;\u62c4ferentialD;\u6146\u0470\u033d\0\0\0\u0342\u0354\0\u0405f;\uc000\ud835\udd3b\u0180;DE\u0348\u0349\u034d\u40a8ot;\u60dcqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03cf\u03e2\u03f8ontourIntegra\xec\u0239o\u0274\u0379\0\0\u037b\xbb\u0349nArrow;\u61d3\u0100eo\u0387\u03a4ft\u0180ART\u0390\u0396\u03a1rrow;\u61d0ightArrow;\u61d4e\xe5\u02cang\u0100LR\u03ab\u03c4eft\u0100AR\u03b3\u03b9rrow;\u67f8ightArrow;\u67faightArrow;\u67f9ight\u0100AT\u03d8\u03derrow;\u61d2ee;\u62a8p\u0241\u03e9\0\0\u03efrrow;\u61d1ownArrow;\u61d5erticalBar;\u6225n\u0300ABLRTa\u0412\u042a\u0430\u045e\u047f\u037crrow\u0180;BU\u041d\u041e\u0422\u6193ar;\u6913pArrow;\u61f5reve;\u4311eft\u02d2\u043a\0\u0446\0\u0450ightVector;\u6950eeVector;\u695eector\u0100;B\u0459\u045a\u61bdar;\u6956ight\u01d4\u0467\0\u0471eeVector;\u695fector\u0100;B\u047a\u047b\u61c1ar;\u6957ee\u0100;A\u0486\u0487\u62a4rrow;\u61a7\u0100ct\u0492\u0497r;\uc000\ud835\udc9frok;\u4110\u0800NTacdfglmopqstux\u04bd\u04c0\u04c4\u04cb\u04de\u04e2\u04e7\u04ee\u04f5\u0521\u052f\u0536\u0552\u055d\u0560\u0565G;\u414aH\u803b\xd0\u40d0cute\u803b\xc9\u40c9\u0180aiy\u04d2\u04d7\u04dcron;\u411arc\u803b\xca\u40ca;\u442dot;\u4116r;\uc000\ud835\udd08rave\u803b\xc8\u40c8ement;\u6208\u0100ap\u04fa\u04fecr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65fberySmallSquare;\u65ab\u0100gp\u0526\u052aon;\u4118f;\uc000\ud835\udd3csilon;\u4395u\u0100ai\u053c\u0549l\u0100;T\u0542\u0543\u6a75ilde;\u6242librium;\u61cc\u0100ci\u0557\u055ar;\u6130m;\u6a73a;\u4397ml\u803b\xcb\u40cb\u0100ip\u056a\u056fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058d\u05b2\u05ccy;\u4424r;\uc000\ud835\udd09lled\u0253\u0597\0\0\u05a3mallSquare;\u65fcerySmallSquare;\u65aa\u0370\u05ba\0\u05bf\0\0\u05c4f;\uc000\ud835\udd3dAll;\u6200riertrf;\u6131c\xf2\u05cb\u0600JTabcdfgorst\u05e8\u05ec\u05ef\u05fa\u0600\u0612\u0616\u061b\u061d\u0623\u066c\u0672cy;\u4403\u803b>\u403emma\u0100;d\u05f7\u05f8\u4393;\u43dcreve;\u411e\u0180eiy\u0607\u060c\u0610dil;\u4122rc;\u411c;\u4413ot;\u4120r;\uc000\ud835\udd0a;\u62d9pf;\uc000\ud835\udd3eeater\u0300EFGLST\u0635\u0644\u064e\u0656\u065b\u0666qual\u0100;L\u063e\u063f\u6265ess;\u62dbullEqual;\u6267reater;\u6aa2ess;\u6277lantEqual;\u6a7eilde;\u6273cr;\uc000\ud835\udca2;\u626b\u0400Aacfiosu\u0685\u068b\u0696\u069b\u069e\u06aa\u06be\u06caRDcy;\u442a\u0100ct\u0690\u0694ek;\u42c7;\u405eirc;\u4124r;\u610clbertSpace;\u610b\u01f0\u06af\0\u06b2f;\u610dizontalLine;\u6500\u0100ct\u06c3\u06c5\xf2\u06a9rok;\u4126mp\u0144\u06d0\u06d8ownHum\xf0\u012fqual;\u624f\u0700EJOacdfgmnostu\u06fa\u06fe\u0703\u0707\u070e\u071a\u071e\u0721\u0728\u0744\u0778\u078b\u078f\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803b\xcd\u40cd\u0100iy\u0713\u0718rc\u803b\xce\u40ce;\u4418ot;\u4130r;\u6111rave\u803b\xcc\u40cc\u0180;ap\u0720\u072f\u073f\u0100cg\u0734\u0737r;\u412ainaryI;\u6148lie\xf3\u03dd\u01f4\u0749\0\u0762\u0100;e\u074d\u074e\u622c\u0100gr\u0753\u0758ral;\u622bsection;\u62c2isible\u0100CT\u076c\u0772omma;\u6063imes;\u6062\u0180gpt\u077f\u0783\u0788on;\u412ef;\uc000\ud835\udd40a;\u4399cr;\u6110ilde;\u4128\u01eb\u079a\0\u079ecy;\u4406l\u803b\xcf\u40cf\u0280cfosu\u07ac\u07b7\u07bc\u07c2\u07d0\u0100iy\u07b1\u07b5rc;\u4134;\u4419r;\uc000\ud835\udd0dpf;\uc000\ud835\udd41\u01e3\u07c7\0\u07ccr;\uc000\ud835\udca5rcy;\u4408kcy;\u4404\u0380HJacfos\u07e4\u07e8\u07ec\u07f1\u07fd\u0802\u0808cy;\u4425cy;\u440cppa;\u439a\u0100ey\u07f6\u07fbdil;\u4136;\u441ar;\uc000\ud835\udd0epf;\uc000\ud835\udd42cr;\uc000\ud835\udca6\u0580JTaceflmost\u0825\u0829\u082c\u0850\u0863\u09b3\u09b8\u09c7\u09cd\u0a37\u0a47cy;\u4409\u803b<\u403c\u0280cmnpr\u0837\u083c\u0841\u0844\u084dute;\u4139bda;\u439bg;\u67ealacetrf;\u6112r;\u619e\u0180aey\u0857\u085c\u0861ron;\u413ddil;\u413b;\u441b\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087e\u08a9\u08b1\u08e0\u08e6\u08fc\u092f\u095b\u0390\u096a\u0100nr\u0883\u088fgleBracket;\u67e8row\u0180;BR\u0899\u089a\u089e\u6190ar;\u61e4ightArrow;\u61c6eiling;\u6308o\u01f5\u08b7\0\u08c3bleBracket;\u67e6n\u01d4\u08c8\0\u08d2eeVector;\u6961ector\u0100;B\u08db\u08dc\u61c3ar;\u6959loor;\u630aight\u0100AV\u08ef\u08f5rrow;\u6194ector;\u694e\u0100er\u0901\u0917e\u0180;AV\u0909\u090a\u0910\u62a3rrow;\u61a4ector;\u695aiangle\u0180;BE\u0924\u0925\u0929\u62b2ar;\u69cfqual;\u62b4p\u0180DTV\u0937\u0942\u094cownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61bfar;\u6958ector\u0100;B\u0965\u0966\u61bcar;\u6952ight\xe1\u039cs\u0300EFGLST\u097e\u098b\u0995\u099d\u09a2\u09adqualGreater;\u62daullEqual;\u6266reater;\u6276ess;\u6aa1lantEqual;\u6a7dilde;\u6272r;\uc000\ud835\udd0f\u0100;e\u09bd\u09be\u62d8ftarrow;\u61daidot;\u413f\u0180npw\u09d4\u0a16\u0a1bg\u0200LRlr\u09de\u09f7\u0a02\u0a10eft\u0100AR\u09e6\u09ecrrow;\u67f5ightArrow;\u67f7ightArrow;\u67f6eft\u0100ar\u03b3\u0a0aight\xe1\u03bfight\xe1\u03caf;\uc000\ud835\udd43er\u0100LR\u0a22\u0a2ceftArrow;\u6199ightArrow;\u6198\u0180cht\u0a3e\u0a40\u0a42\xf2\u084c;\u61b0rok;\u4141;\u626a\u0400acefiosu\u0a5a\u0a5d\u0a60\u0a77\u0a7c\u0a85\u0a8b\u0a8ep;\u6905y;\u441c\u0100dl\u0a65\u0a6fiumSpace;\u605flintrf;\u6133r;\uc000\ud835\udd10nusPlus;\u6213pf;\uc000\ud835\udd44c\xf2\u0a76;\u439c\u0480Jacefostu\u0aa3\u0aa7\u0aad\u0ac0\u0b14\u0b19\u0d91\u0d97\u0d9ecy;\u440acute;\u4143\u0180aey\u0ab4\u0ab9\u0aberon;\u4147dil;\u4145;\u441d\u0180gsw\u0ac7\u0af0\u0b0eative\u0180MTV\u0ad3\u0adf\u0ae8ediumSpace;\u600bhi\u0100cn\u0ae6\u0ad8\xeb\u0ad9eryThi\xee\u0ad9ted\u0100GL\u0af8\u0b06reaterGreate\xf2\u0673essLes\xf3\u0a48Line;\u400ar;\uc000\ud835\udd11\u0200Bnpt\u0b22\u0b28\u0b37\u0b3areak;\u6060BreakingSpace;\u40a0f;\u6115\u0680;CDEGHLNPRSTV\u0b55\u0b56\u0b6a\u0b7c\u0ba1\u0beb\u0c04\u0c5e\u0c84\u0ca6\u0cd8\u0d61\u0d85\u6aec\u0100ou\u0b5b\u0b64ngruent;\u6262pCap;\u626doubleVerticalBar;\u6226\u0180lqx\u0b83\u0b8a\u0b9bement;\u6209ual\u0100;T\u0b92\u0b93\u6260ilde;\uc000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0bb6\u0bb7\u0bbd\u0bc9\u0bd3\u0bd8\u0be5\u626fqual;\u6271ullEqual;\uc000\u2267\u0338reater;\uc000\u226b\u0338ess;\u6279lantEqual;\uc000\u2a7e\u0338ilde;\u6275ump\u0144\u0bf2\u0bfdownHump;\uc000\u224e\u0338qual;\uc000\u224f\u0338e\u0100fs\u0c0a\u0c27tTriangle\u0180;BE\u0c1a\u0c1b\u0c21\u62eaar;\uc000\u29cf\u0338qual;\u62ecs\u0300;EGLST\u0c35\u0c36\u0c3c\u0c44\u0c4b\u0c58\u626equal;\u6270reater;\u6278ess;\uc000\u226a\u0338lantEqual;\uc000\u2a7d\u0338ilde;\u6274ested\u0100GL\u0c68\u0c79reaterGreater;\uc000\u2aa2\u0338essLess;\uc000\u2aa1\u0338recedes\u0180;ES\u0c92\u0c93\u0c9b\u6280qual;\uc000\u2aaf\u0338lantEqual;\u62e0\u0100ei\u0cab\u0cb9verseElement;\u620cghtTriangle\u0180;BE\u0ccb\u0ccc\u0cd2\u62ebar;\uc000\u29d0\u0338qual;\u62ed\u0100qu\u0cdd\u0d0cuareSu\u0100bp\u0ce8\u0cf9set\u0100;E\u0cf0\u0cf3\uc000\u228f\u0338qual;\u62e2erset\u0100;E\u0d03\u0d06\uc000\u2290\u0338qual;\u62e3\u0180bcp\u0d13\u0d24\u0d4eset\u0100;E\u0d1b\u0d1e\uc000\u2282\u20d2qual;\u6288ceeds\u0200;EST\u0d32\u0d33\u0d3b\u0d46\u6281qual;\uc000\u2ab0\u0338lantEqual;\u62e1ilde;\uc000\u227f\u0338erset\u0100;E\u0d58\u0d5b\uc000\u2283\u20d2qual;\u6289ilde\u0200;EFT\u0d6e\u0d6f\u0d75\u0d7f\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uc000\ud835\udca9ilde\u803b\xd1\u40d1;\u439d\u0700Eacdfgmoprstuv\u0dbd\u0dc2\u0dc9\u0dd5\u0ddb\u0de0\u0de7\u0dfc\u0e02\u0e20\u0e22\u0e32\u0e3f\u0e44lig;\u4152cute\u803b\xd3\u40d3\u0100iy\u0dce\u0dd3rc\u803b\xd4\u40d4;\u441eblac;\u4150r;\uc000\ud835\udd12rave\u803b\xd2\u40d2\u0180aei\u0dee\u0df2\u0df6cr;\u414cga;\u43a9cron;\u439fpf;\uc000\ud835\udd46enCurly\u0100DQ\u0e0e\u0e1aoubleQuote;\u601cuote;\u6018;\u6a54\u0100cl\u0e27\u0e2cr;\uc000\ud835\udcaaash\u803b\xd8\u40d8i\u016c\u0e37\u0e3cde\u803b\xd5\u40d5es;\u6a37ml\u803b\xd6\u40d6er\u0100BP\u0e4b\u0e60\u0100ar\u0e50\u0e53r;\u603eac\u0100ek\u0e5a\u0e5c;\u63deet;\u63b4arenthesis;\u63dc\u0480acfhilors\u0e7f\u0e87\u0e8a\u0e8f\u0e92\u0e94\u0e9d\u0eb0\u0efcrtialD;\u6202y;\u441fr;\uc000\ud835\udd13i;\u43a6;\u43a0usMinus;\u40b1\u0100ip\u0ea2\u0eadncareplan\xe5\u069df;\u6119\u0200;eio\u0eb9\u0eba\u0ee0\u0ee4\u6abbcedes\u0200;EST\u0ec8\u0ec9\u0ecf\u0eda\u627aqual;\u6aaflantEqual;\u627cilde;\u627eme;\u6033\u0100dp\u0ee9\u0eeeuct;\u620fortion\u0100;a\u0225\u0ef9l;\u621d\u0100ci\u0f01\u0f06r;\uc000\ud835\udcab;\u43a8\u0200Ufos\u0f11\u0f16\u0f1b\u0f1fOT\u803b\"\u4022r;\uc000\ud835\udd14pf;\u611acr;\uc000\ud835\udcac\u0600BEacefhiorsu\u0f3e\u0f43\u0f47\u0f60\u0f73\u0fa7\u0faa\u0fad\u1096\u10a9\u10b4\u10bearr;\u6910G\u803b\xae\u40ae\u0180cnr\u0f4e\u0f53\u0f56ute;\u4154g;\u67ebr\u0100;t\u0f5c\u0f5d\u61a0l;\u6916\u0180aey\u0f67\u0f6c\u0f71ron;\u4158dil;\u4156;\u4420\u0100;v\u0f78\u0f79\u611cerse\u0100EU\u0f82\u0f99\u0100lq\u0f87\u0f8eement;\u620builibrium;\u61cbpEquilibrium;\u696fr\xbb\u0f79o;\u43a1ght\u0400ACDFTUVa\u0fc1\u0feb\u0ff3\u1022\u1028\u105b\u1087\u03d8\u0100nr\u0fc6\u0fd2gleBracket;\u67e9row\u0180;BL\u0fdc\u0fdd\u0fe1\u6192ar;\u61e5eftArrow;\u61c4eiling;\u6309o\u01f5\u0ff9\0\u1005bleBracket;\u67e7n\u01d4\u100a\0\u1014eeVector;\u695dector\u0100;B\u101d\u101e\u61c2ar;\u6955loor;\u630b\u0100er\u102d\u1043e\u0180;AV\u1035\u1036\u103c\u62a2rrow;\u61a6ector;\u695biangle\u0180;BE\u1050\u1051\u1055\u62b3ar;\u69d0qual;\u62b5p\u0180DTV\u1063\u106e\u1078ownVector;\u694feeVector;\u695cector\u0100;B\u1082\u1083\u61bear;\u6954ector\u0100;B\u1091\u1092\u61c0ar;\u6953\u0100pu\u109b\u109ef;\u611dndImplies;\u6970ightarrow;\u61db\u0100ch\u10b9\u10bcr;\u611b;\u61b1leDelayed;\u69f4\u0680HOacfhimoqstu\u10e4\u10f1\u10f7\u10fd\u1119\u111e\u1151\u1156\u1161\u1167\u11b5\u11bb\u11bf\u0100Cc\u10e9\u10eeHcy;\u4429y;\u4428FTcy;\u442ccute;\u415a\u0280;aeiy\u1108\u1109\u110e\u1113\u1117\u6abcron;\u4160dil;\u415erc;\u415c;\u4421r;\uc000\ud835\udd16ort\u0200DLRU\u112a\u1134\u113e\u1149ownArrow\xbb\u041eeftArrow\xbb\u089aightArrow\xbb\u0fddpArrow;\u6191gma;\u43a3allCircle;\u6218pf;\uc000\ud835\udd4a\u0272\u116d\0\0\u1170t;\u621aare\u0200;ISU\u117b\u117c\u1189\u11af\u65a1ntersection;\u6293u\u0100bp\u118f\u119eset\u0100;E\u1197\u1198\u628fqual;\u6291erset\u0100;E\u11a8\u11a9\u6290qual;\u6292nion;\u6294cr;\uc000\ud835\udcaear;\u62c6\u0200bcmp\u11c8\u11db\u1209\u120b\u0100;s\u11cd\u11ce\u62d0et\u0100;E\u11cd\u11d5qual;\u6286\u0100ch\u11e0\u1205eeds\u0200;EST\u11ed\u11ee\u11f4\u11ff\u627bqual;\u6ab0lantEqual;\u627dilde;\u627fTh\xe1\u0f8c;\u6211\u0180;es\u1212\u1213\u1223\u62d1rset\u0100;E\u121c\u121d\u6283qual;\u6287et\xbb\u1213\u0580HRSacfhiors\u123e\u1244\u1249\u1255\u125e\u1271\u1276\u129f\u12c2\u12c8\u12d1ORN\u803b\xde\u40deADE;\u6122\u0100Hc\u124e\u1252cy;\u440by;\u4426\u0100bu\u125a\u125c;\u4009;\u43a4\u0180aey\u1265\u126a\u126fron;\u4164dil;\u4162;\u4422r;\uc000\ud835\udd17\u0100ei\u127b\u1289\u01f2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128e\u1298kSpace;\uc000\u205f\u200aSpace;\u6009lde\u0200;EFT\u12ab\u12ac\u12b2\u12bc\u623cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uc000\ud835\udd4bipleDot;\u60db\u0100ct\u12d6\u12dbr;\uc000\ud835\udcafrok;\u4166\u0ae1\u12f7\u130e\u131a\u1326\0\u132c\u1331\0\0\0\0\0\u1338\u133d\u1377\u1385\0\u13ff\u1404\u140a\u1410\u0100cr\u12fb\u1301ute\u803b\xda\u40dar\u0100;o\u1307\u1308\u619fcir;\u6949r\u01e3\u1313\0\u1316y;\u440eve;\u416c\u0100iy\u131e\u1323rc\u803b\xdb\u40db;\u4423blac;\u4170r;\uc000\ud835\udd18rave\u803b\xd9\u40d9acr;\u416a\u0100di\u1341\u1369er\u0100BP\u1348\u135d\u0100ar\u134d\u1350r;\u405fac\u0100ek\u1357\u1359;\u63dfet;\u63b5arenthesis;\u63ddon\u0100;P\u1370\u1371\u62c3lus;\u628e\u0100gp\u137b\u137fon;\u4172f;\uc000\ud835\udd4c\u0400ADETadps\u1395\u13ae\u13b8\u13c4\u03e8\u13d2\u13d7\u13f3rrow\u0180;BD\u1150\u13a0\u13a4ar;\u6912ownArrow;\u61c5ownArrow;\u6195quilibrium;\u696eee\u0100;A\u13cb\u13cc\u62a5rrow;\u61a5own\xe1\u03f3er\u0100LR\u13de\u13e8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13f9\u13fa\u43d2on;\u43a5ing;\u416ecr;\uc000\ud835\udcb0ilde;\u4168ml\u803b\xdc\u40dc\u0480Dbcdefosv\u1427\u142c\u1430\u1433\u143e\u1485\u148a\u1490\u1496ash;\u62abar;\u6aeby;\u4412ash\u0100;l\u143b\u143c\u62a9;\u6ae6\u0100er\u1443\u1445;\u62c1\u0180bty\u144c\u1450\u147aar;\u6016\u0100;i\u144f\u1455cal\u0200BLST\u1461\u1465\u146a\u1474ar;\u6223ine;\u407ceparator;\u6758ilde;\u6240ThinSpace;\u600ar;\uc000\ud835\udd19pf;\uc000\ud835\udd4dcr;\uc000\ud835\udcb1dash;\u62aa\u0280cefos\u14a7\u14ac\u14b1\u14b6\u14bcirc;\u4174dge;\u62c0r;\uc000\ud835\udd1apf;\uc000\ud835\udd4ecr;\uc000\ud835\udcb2\u0200fios\u14cb\u14d0\u14d2\u14d8r;\uc000\ud835\udd1b;\u439epf;\uc000\ud835\udd4fcr;\uc000\ud835\udcb3\u0480AIUacfosu\u14f1\u14f5\u14f9\u14fd\u1504\u150f\u1514\u151a\u1520cy;\u442fcy;\u4407cy;\u442ecute\u803b\xdd\u40dd\u0100iy\u1509\u150drc;\u4176;\u442br;\uc000\ud835\udd1cpf;\uc000\ud835\udd50cr;\uc000\ud835\udcb4ml;\u4178\u0400Hacdefos\u1535\u1539\u153f\u154b\u154f\u155d\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417d;\u4417ot;\u417b\u01f2\u1554\0\u155boWidt\xe8\u0ad9a;\u4396r;\u6128pf;\u6124cr;\uc000\ud835\udcb5\u0be1\u1583\u158a\u1590\0\u15b0\u15b6\u15bf\0\0\0\0\u15c6\u15db\u15eb\u165f\u166d\0\u1695\u169b\u16b2\u16b9\0\u16becute\u803b\xe1\u40e1reve;\u4103\u0300;Ediuy\u159c\u159d\u15a1\u15a3\u15a8\u15ad\u623e;\uc000\u223e\u0333;\u623frc\u803b\xe2\u40e2te\u80bb\xb4\u0306;\u4430lig\u803b\xe6\u40e6\u0100;r\xb2\u15ba;\uc000\ud835\udd1erave\u803b\xe0\u40e0\u0100ep\u15ca\u15d6\u0100fp\u15cf\u15d4sym;\u6135\xe8\u15d3ha;\u43b1\u0100ap\u15dfc\u0100cl\u15e4\u15e7r;\u4101g;\u6a3f\u0264\u15f0\0\0\u160a\u0280;adsv\u15fa\u15fb\u15ff\u1601\u1607\u6227nd;\u6a55;\u6a5clope;\u6a58;\u6a5a\u0380;elmrsz\u1618\u1619\u161b\u161e\u163f\u164f\u1659\u6220;\u69a4e\xbb\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163a\u163c\u163e;\u69a8;\u69a9;\u69aa;\u69ab;\u69ac;\u69ad;\u69ae;\u69aft\u0100;v\u1645\u1646\u621fb\u0100;d\u164c\u164d\u62be;\u699d\u0100pt\u1654\u1657h;\u6222\xbb\xb9arr;\u637c\u0100gp\u1663\u1667on;\u4105f;\uc000\ud835\udd52\u0380;Eaeiop\u12c1\u167b\u167d\u1682\u1684\u1687\u168a;\u6a70cir;\u6a6f;\u624ad;\u624bs;\u4027rox\u0100;e\u12c1\u1692\xf1\u1683ing\u803b\xe5\u40e5\u0180cty\u16a1\u16a6\u16a8r;\uc000\ud835\udcb6;\u402amp\u0100;e\u12c1\u16af\xf1\u0288ilde\u803b\xe3\u40e3ml\u803b\xe4\u40e4\u0100ci\u16c2\u16c8onin\xf4\u0272nt;\u6a11\u0800Nabcdefiklnoprsu\u16ed\u16f1\u1730\u173c\u1743\u1748\u1778\u177d\u17e0\u17e6\u1839\u1850\u170d\u193d\u1948\u1970ot;\u6aed\u0100cr\u16f6\u171ek\u0200ceps\u1700\u1705\u170d\u1713ong;\u624cpsilon;\u43f6rime;\u6035im\u0100;e\u171a\u171b\u623dq;\u62cd\u0176\u1722\u1726ee;\u62bded\u0100;g\u172c\u172d\u6305e\xbb\u172drk\u0100;t\u135c\u1737brk;\u63b6\u0100oy\u1701\u1741;\u4431quo;\u601e\u0280cmprt\u1753\u175b\u1761\u1764\u1768aus\u0100;e\u010a\u0109ptyv;\u69b0s\xe9\u170cno\xf5\u0113\u0180ahw\u176f\u1771\u1773;\u43b2;\u6136een;\u626cr;\uc000\ud835\udd1fg\u0380costuvw\u178d\u179d\u17b3\u17c1\u17d5\u17db\u17de\u0180aiu\u1794\u1796\u179a\xf0\u0760rc;\u65efp\xbb\u1371\u0180dpt\u17a4\u17a8\u17adot;\u6a00lus;\u6a01imes;\u6a02\u0271\u17b9\0\0\u17becup;\u6a06ar;\u6605riangle\u0100du\u17cd\u17d2own;\u65bdp;\u65b3plus;\u6a04e\xe5\u1444\xe5\u14adarow;\u690d\u0180ako\u17ed\u1826\u1835\u0100cn\u17f2\u1823k\u0180lst\u17fa\u05ab\u1802ozenge;\u69ebriangle\u0200;dlr\u1812\u1813\u1818\u181d\u65b4own;\u65beeft;\u65c2ight;\u65b8k;\u6423\u01b1\u182b\0\u1833\u01b2\u182f\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183e\u184d\u0100;q\u1843\u1846\uc000=\u20e5uiv;\uc000\u2261\u20e5t;\u6310\u0200ptwx\u1859\u185e\u1867\u186cf;\uc000\ud835\udd53\u0100;t\u13cb\u1863om\xbb\u13cctie;\u62c8\u0600DHUVbdhmptuv\u1885\u1896\u18aa\u18bb\u18d7\u18db\u18ec\u18ff\u1905\u190a\u1910\u1921\u0200LRlr\u188e\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18a1\u18a2\u18a4\u18a6\u18a8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18b3\u18b5\u18b7\u18b9;\u655d;\u655a;\u655c;\u6559\u0380;HLRhlr\u18ca\u18cb\u18cd\u18cf\u18d1\u18d3\u18d5\u6551;\u656c;\u6563;\u6560;\u656b;\u6562;\u655fox;\u69c9\u0200LRlr\u18e4\u18e6\u18e8\u18ea;\u6555;\u6552;\u6510;\u650c\u0280;DUdu\u06bd\u18f7\u18f9\u18fb\u18fd;\u6565;\u6568;\u652c;\u6534inus;\u629flus;\u629eimes;\u62a0\u0200LRlr\u1919\u191b\u191d\u191f;\u655b;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193b\u6502;\u656a;\u6561;\u655e;\u653c;\u6524;\u651c\u0100ev\u0123\u1942bar\u803b\xa6\u40a6\u0200ceio\u1951\u1956\u195a\u1960r;\uc000\ud835\udcb7mi;\u604fm\u0100;e\u171a\u171cl\u0180;bh\u1968\u1969\u196b\u405c;\u69c5sub;\u67c8\u016c\u1974\u197el\u0100;e\u1979\u197a\u6022t\xbb\u197ap\u0180;Ee\u012f\u1985\u1987;\u6aae\u0100;q\u06dc\u06db\u0ce1\u19a7\0\u19e8\u1a11\u1a15\u1a32\0\u1a37\u1a50\0\0\u1ab4\0\0\u1ac1\0\0\u1b21\u1b2e\u1b4d\u1b52\0\u1bfd\0\u1c0c\u0180cpr\u19ad\u19b2\u19ddute;\u4107\u0300;abcds\u19bf\u19c0\u19c4\u19ca\u19d5\u19d9\u6229nd;\u6a44rcup;\u6a49\u0100au\u19cf\u19d2p;\u6a4bp;\u6a47ot;\u6a40;\uc000\u2229\ufe00\u0100eo\u19e2\u19e5t;\u6041\xee\u0693\u0200aeiu\u19f0\u19fb\u1a01\u1a05\u01f0\u19f5\0\u19f8s;\u6a4don;\u410ddil\u803b\xe7\u40e7rc;\u4109ps\u0100;s\u1a0c\u1a0d\u6a4cm;\u6a50ot;\u410b\u0180dmn\u1a1b\u1a20\u1a26il\u80bb\xb8\u01adptyv;\u69b2t\u8100\xa2;e\u1a2d\u1a2e\u40a2r\xe4\u01b2r;\uc000\ud835\udd20\u0180cei\u1a3d\u1a40\u1a4dy;\u4447ck\u0100;m\u1a47\u1a48\u6713ark\xbb\u1a48;\u43c7r\u0380;Ecefms\u1a5f\u1a60\u1a62\u1a6b\u1aa4\u1aaa\u1aae\u65cb;\u69c3\u0180;el\u1a69\u1a6a\u1a6d\u42c6q;\u6257e\u0261\u1a74\0\0\u1a88rrow\u0100lr\u1a7c\u1a81eft;\u61baight;\u61bb\u0280RSacd\u1a92\u1a94\u1a96\u1a9a\u1a9f\xbb\u0f47;\u64c8st;\u629birc;\u629aash;\u629dnint;\u6a10id;\u6aefcir;\u69c2ubs\u0100;u\u1abb\u1abc\u6663it\xbb\u1abc\u02ec\u1ac7\u1ad4\u1afa\0\u1b0aon\u0100;e\u1acd\u1ace\u403a\u0100;q\xc7\xc6\u026d\u1ad9\0\0\u1ae2a\u0100;t\u1ade\u1adf\u402c;\u4040\u0180;fl\u1ae8\u1ae9\u1aeb\u6201\xee\u1160e\u0100mx\u1af1\u1af6ent\xbb\u1ae9e\xf3\u024d\u01e7\u1afe\0\u1b07\u0100;d\u12bb\u1b02ot;\u6a6dn\xf4\u0246\u0180fry\u1b10\u1b14\u1b17;\uc000\ud835\udd54o\xe4\u0254\u8100\xa9;s\u0155\u1b1dr;\u6117\u0100ao\u1b25\u1b29rr;\u61b5ss;\u6717\u0100cu\u1b32\u1b37r;\uc000\ud835\udcb8\u0100bp\u1b3c\u1b44\u0100;e\u1b41\u1b42\u6acf;\u6ad1\u0100;e\u1b49\u1b4a\u6ad0;\u6ad2dot;\u62ef\u0380delprvw\u1b60\u1b6c\u1b77\u1b82\u1bac\u1bd4\u1bf9arr\u0100lr\u1b68\u1b6a;\u6938;\u6935\u0270\u1b72\0\0\u1b75r;\u62dec;\u62dfarr\u0100;p\u1b7f\u1b80\u61b6;\u693d\u0300;bcdos\u1b8f\u1b90\u1b96\u1ba1\u1ba5\u1ba8\u622arcap;\u6a48\u0100au\u1b9b\u1b9ep;\u6a46p;\u6a4aot;\u628dr;\u6a45;\uc000\u222a\ufe00\u0200alrv\u1bb5\u1bbf\u1bde\u1be3rr\u0100;m\u1bbc\u1bbd\u61b7;\u693cy\u0180evw\u1bc7\u1bd4\u1bd8q\u0270\u1bce\0\0\u1bd2re\xe3\u1b73u\xe3\u1b75ee;\u62ceedge;\u62cfen\u803b\xa4\u40a4earrow\u0100lr\u1bee\u1bf3eft\xbb\u1b80ight\xbb\u1bbde\xe4\u1bdd\u0100ci\u1c01\u1c07onin\xf4\u01f7nt;\u6231lcty;\u632d\u0980AHabcdefhijlorstuwz\u1c38\u1c3b\u1c3f\u1c5d\u1c69\u1c75\u1c8a\u1c9e\u1cac\u1cb7\u1cfb\u1cff\u1d0d\u1d7b\u1d91\u1dab\u1dbb\u1dc6\u1dcdr\xf2\u0381ar;\u6965\u0200glrs\u1c48\u1c4d\u1c52\u1c54ger;\u6020eth;\u6138\xf2\u1133h\u0100;v\u1c5a\u1c5b\u6010\xbb\u090a\u016b\u1c61\u1c67arow;\u690fa\xe3\u0315\u0100ay\u1c6e\u1c73ron;\u410f;\u4434\u0180;ao\u0332\u1c7c\u1c84\u0100gr\u02bf\u1c81r;\u61catseq;\u6a77\u0180glm\u1c91\u1c94\u1c98\u803b\xb0\u40b0ta;\u43b4ptyv;\u69b1\u0100ir\u1ca3\u1ca8sht;\u697f;\uc000\ud835\udd21ar\u0100lr\u1cb3\u1cb5\xbb\u08dc\xbb\u101e\u0280aegsv\u1cc2\u0378\u1cd6\u1cdc\u1ce0m\u0180;os\u0326\u1cca\u1cd4nd\u0100;s\u0326\u1cd1uit;\u6666amma;\u43ddin;\u62f2\u0180;io\u1ce7\u1ce8\u1cf8\u40f7de\u8100\xf7;o\u1ce7\u1cf0ntimes;\u62c7n\xf8\u1cf7cy;\u4452c\u026f\u1d06\0\0\u1d0arn;\u631eop;\u630d\u0280lptuw\u1d18\u1d1d\u1d22\u1d49\u1d55lar;\u4024f;\uc000\ud835\udd55\u0280;emps\u030b\u1d2d\u1d37\u1d3d\u1d42q\u0100;d\u0352\u1d33ot;\u6251inus;\u6238lus;\u6214quare;\u62a1blebarwedg\xe5\xfan\u0180adh\u112e\u1d5d\u1d67ownarrow\xf3\u1c83arpoon\u0100lr\u1d72\u1d76ef\xf4\u1cb4igh\xf4\u1cb6\u0162\u1d7f\u1d85karo\xf7\u0f42\u026f\u1d8a\0\0\u1d8ern;\u631fop;\u630c\u0180cot\u1d98\u1da3\u1da6\u0100ry\u1d9d\u1da1;\uc000\ud835\udcb9;\u4455l;\u69f6rok;\u4111\u0100dr\u1db0\u1db4ot;\u62f1i\u0100;f\u1dba\u1816\u65bf\u0100ah\u1dc0\u1dc3r\xf2\u0429a\xf2\u0fa6angle;\u69a6\u0100ci\u1dd2\u1dd5y;\u445fgrarr;\u67ff\u0900Dacdefglmnopqrstux\u1e01\u1e09\u1e19\u1e38\u0578\u1e3c\u1e49\u1e61\u1e7e\u1ea5\u1eaf\u1ebd\u1ee1\u1f2a\u1f37\u1f44\u1f4e\u1f5a\u0100Do\u1e06\u1d34o\xf4\u1c89\u0100cs\u1e0e\u1e14ute\u803b\xe9\u40e9ter;\u6a6e\u0200aioy\u1e22\u1e27\u1e31\u1e36ron;\u411br\u0100;c\u1e2d\u1e2e\u6256\u803b\xea\u40ealon;\u6255;\u444dot;\u4117\u0100Dr\u1e41\u1e45ot;\u6252;\uc000\ud835\udd22\u0180;rs\u1e50\u1e51\u1e57\u6a9aave\u803b\xe8\u40e8\u0100;d\u1e5c\u1e5d\u6a96ot;\u6a98\u0200;ils\u1e6a\u1e6b\u1e72\u1e74\u6a99nters;\u63e7;\u6113\u0100;d\u1e79\u1e7a\u6a95ot;\u6a97\u0180aps\u1e85\u1e89\u1e97cr;\u4113ty\u0180;sv\u1e92\u1e93\u1e95\u6205et\xbb\u1e93p\u01001;\u1e9d\u1ea4\u0133\u1ea1\u1ea3;\u6004;\u6005\u6003\u0100gs\u1eaa\u1eac;\u414bp;\u6002\u0100gp\u1eb4\u1eb8on;\u4119f;\uc000\ud835\udd56\u0180als\u1ec4\u1ece\u1ed2r\u0100;s\u1eca\u1ecb\u62d5l;\u69e3us;\u6a71i\u0180;lv\u1eda\u1edb\u1edf\u43b5on\xbb\u1edb;\u43f5\u0200csuv\u1eea\u1ef3\u1f0b\u1f23\u0100io\u1eef\u1e31rc\xbb\u1e2e\u0269\u1ef9\0\0\u1efb\xed\u0548ant\u0100gl\u1f02\u1f06tr\xbb\u1e5dess\xbb\u1e7a\u0180aei\u1f12\u1f16\u1f1als;\u403dst;\u625fv\u0100;D\u0235\u1f20D;\u6a78parsl;\u69e5\u0100Da\u1f2f\u1f33ot;\u6253rr;\u6971\u0180cdi\u1f3e\u1f41\u1ef8r;\u612fo\xf4\u0352\u0100ah\u1f49\u1f4b;\u43b7\u803b\xf0\u40f0\u0100mr\u1f53\u1f57l\u803b\xeb\u40ebo;\u60ac\u0180cip\u1f61\u1f64\u1f67l;\u4021s\xf4\u056e\u0100eo\u1f6c\u1f74ctatio\xee\u0559nential\xe5\u0579\u09e1\u1f92\0\u1f9e\0\u1fa1\u1fa7\0\0\u1fc6\u1fcc\0\u1fd3\0\u1fe6\u1fea\u2000\0\u2008\u205allingdotse\xf1\u1e44y;\u4444male;\u6640\u0180ilr\u1fad\u1fb3\u1fc1lig;\u8000\ufb03\u0269\u1fb9\0\0\u1fbdg;\u8000\ufb00ig;\u8000\ufb04;\uc000\ud835\udd23lig;\u8000\ufb01lig;\uc000fj\u0180alt\u1fd9\u1fdc\u1fe1t;\u666dig;\u8000\ufb02ns;\u65b1of;\u4192\u01f0\u1fee\0\u1ff3f;\uc000\ud835\udd57\u0100ak\u05bf\u1ff7\u0100;v\u1ffc\u1ffd\u62d4;\u6ad9artint;\u6a0d\u0100ao\u200c\u2055\u0100cs\u2011\u2052\u03b1\u201a\u2030\u2038\u2045\u2048\0\u2050\u03b2\u2022\u2025\u2027\u202a\u202c\0\u202e\u803b\xbd\u40bd;\u6153\u803b\xbc\u40bc;\u6155;\u6159;\u615b\u01b3\u2034\0\u2036;\u6154;\u6156\u02b4\u203e\u2041\0\0\u2043\u803b\xbe\u40be;\u6157;\u615c5;\u6158\u01b6\u204c\0\u204e;\u615a;\u615d8;\u615el;\u6044wn;\u6322cr;\uc000\ud835\udcbb\u0880Eabcdefgijlnorstv\u2082\u2089\u209f\u20a5\u20b0\u20b4\u20f0\u20f5\u20fa\u20ff\u2103\u2112\u2138\u0317\u213e\u2152\u219e\u0100;l\u064d\u2087;\u6a8c\u0180cmp\u2090\u2095\u209dute;\u41f5ma\u0100;d\u209c\u1cda\u43b3;\u6a86reve;\u411f\u0100iy\u20aa\u20aerc;\u411d;\u4433ot;\u4121\u0200;lqs\u063e\u0642\u20bd\u20c9\u0180;qs\u063e\u064c\u20c4lan\xf4\u0665\u0200;cdl\u0665\u20d2\u20d5\u20e5c;\u6aa9ot\u0100;o\u20dc\u20dd\u6a80\u0100;l\u20e2\u20e3\u6a82;\u6a84\u0100;e\u20ea\u20ed\uc000\u22db\ufe00s;\u6a94r;\uc000\ud835\udd24\u0100;g\u0673\u061bmel;\u6137cy;\u4453\u0200;Eaj\u065a\u210c\u210e\u2110;\u6a92;\u6aa5;\u6aa4\u0200Eaes\u211b\u211d\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6a8arox\xbb\u2124\u0100;q\u212e\u212f\u6a88\u0100;q\u212e\u211bim;\u62e7pf;\uc000\ud835\udd58\u0100ci\u2143\u2146r;\u610am\u0180;el\u066b\u214e\u2150;\u6a8e;\u6a90\u8300>;cdlqr\u05ee\u2160\u216a\u216e\u2173\u2179\u0100ci\u2165\u2167;\u6aa7r;\u6a7aot;\u62d7Par;\u6995uest;\u6a7c\u0280adels\u2184\u216a\u2190\u0656\u219b\u01f0\u2189\0\u218epro\xf8\u209er;\u6978q\u0100lq\u063f\u2196les\xf3\u2088i\xed\u066b\u0100en\u21a3\u21adrtneqq;\uc000\u2269\ufe00\xc5\u21aa\u0500Aabcefkosy\u21c4\u21c7\u21f1\u21f5\u21fa\u2218\u221d\u222f\u2268\u227dr\xf2\u03a0\u0200ilmr\u21d0\u21d4\u21d7\u21dbrs\xf0\u1484f\xbb\u2024il\xf4\u06a9\u0100dr\u21e0\u21e4cy;\u444a\u0180;cw\u08f4\u21eb\u21efir;\u6948;\u61adar;\u610firc;\u4125\u0180alr\u2201\u220e\u2213rts\u0100;u\u2209\u220a\u6665it\xbb\u220alip;\u6026con;\u62b9r;\uc000\ud835\udd25s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223a\u223e\u2243\u225e\u2263rr;\u61fftht;\u623bk\u0100lr\u2249\u2253eftarrow;\u61a9ightarrow;\u61aaf;\uc000\ud835\udd59bar;\u6015\u0180clt\u226f\u2274\u2278r;\uc000\ud835\udcbdas\xe8\u21f4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xbb\u1c5b\u0ae1\u22a3\0\u22aa\0\u22b8\u22c5\u22ce\0\u22d5\u22f3\0\0\u22f8\u2322\u2367\u2362\u237f\0\u2386\u23aa\u23b4cute\u803b\xed\u40ed\u0180;iy\u0771\u22b0\u22b5rc\u803b\xee\u40ee;\u4438\u0100cx\u22bc\u22bfy;\u4435cl\u803b\xa1\u40a1\u0100fr\u039f\u22c9;\uc000\ud835\udd26rave\u803b\xec\u40ec\u0200;ino\u073e\u22dd\u22e9\u22ee\u0100in\u22e2\u22e6nt;\u6a0ct;\u622dfin;\u69dcta;\u6129lig;\u4133\u0180aop\u22fe\u231a\u231d\u0180cgt\u2305\u2308\u2317r;\u412b\u0180elp\u071f\u230f\u2313in\xe5\u078ear\xf4\u0720h;\u4131f;\u62b7ed;\u41b5\u0280;cfot\u04f4\u232c\u2331\u233d\u2341are;\u6105in\u0100;t\u2338\u2339\u621eie;\u69dddo\xf4\u2319\u0280;celp\u0757\u234c\u2350\u235b\u2361al;\u62ba\u0100gr\u2355\u2359er\xf3\u1563\xe3\u234darhk;\u6a17rod;\u6a3c\u0200cgpt\u236f\u2372\u2376\u237by;\u4451on;\u412ff;\uc000\ud835\udd5aa;\u43b9uest\u803b\xbf\u40bf\u0100ci\u238a\u238fr;\uc000\ud835\udcben\u0280;Edsv\u04f4\u239b\u239d\u23a1\u04f3;\u62f9ot;\u62f5\u0100;v\u23a6\u23a7\u62f4;\u62f3\u0100;i\u0777\u23aelde;\u4129\u01eb\u23b8\0\u23bccy;\u4456l\u803b\xef\u40ef\u0300cfmosu\u23cc\u23d7\u23dc\u23e1\u23e7\u23f5\u0100iy\u23d1\u23d5rc;\u4135;\u4439r;\uc000\ud835\udd27ath;\u4237pf;\uc000\ud835\udd5b\u01e3\u23ec\0\u23f1r;\uc000\ud835\udcbfrcy;\u4458kcy;\u4454\u0400acfghjos\u240b\u2416\u2422\u2427\u242d\u2431\u2435\u243bppa\u0100;v\u2413\u2414\u43ba;\u43f0\u0100ey\u241b\u2420dil;\u4137;\u443ar;\uc000\ud835\udd28reen;\u4138cy;\u4445cy;\u445cpf;\uc000\ud835\udd5ccr;\uc000\ud835\udcc0\u0b80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248d\u2491\u250e\u253d\u255a\u2580\u264e\u265e\u2665\u2679\u267d\u269a\u26b2\u26d8\u275d\u2768\u278b\u27c0\u2801\u2812\u0180art\u2477\u247a\u247cr\xf2\u09c6\xf2\u0395ail;\u691barr;\u690e\u0100;g\u0994\u248b;\u6a8bar;\u6962\u0963\u24a5\0\u24aa\0\u24b1\0\0\0\0\0\u24b5\u24ba\0\u24c6\u24c8\u24cd\0\u24f9ute;\u413amptyv;\u69b4ra\xee\u084cbda;\u43bbg\u0180;dl\u088e\u24c1\u24c3;\u6991\xe5\u088e;\u6a85uo\u803b\xab\u40abr\u0400;bfhlpst\u0899\u24de\u24e6\u24e9\u24eb\u24ee\u24f1\u24f5\u0100;f\u089d\u24e3s;\u691fs;\u691d\xeb\u2252p;\u61abl;\u6939im;\u6973l;\u61a2\u0180;ae\u24ff\u2500\u2504\u6aabil;\u6919\u0100;s\u2509\u250a\u6aad;\uc000\u2aad\ufe00\u0180abr\u2515\u2519\u251drr;\u690crk;\u6772\u0100ak\u2522\u252cc\u0100ek\u2528\u252a;\u407b;\u405b\u0100es\u2531\u2533;\u698bl\u0100du\u2539\u253b;\u698f;\u698d\u0200aeuy\u2546\u254b\u2556\u2558ron;\u413e\u0100di\u2550\u2554il;\u413c\xec\u08b0\xe2\u2529;\u443b\u0200cqrs\u2563\u2566\u256d\u257da;\u6936uo\u0100;r\u0e19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694bh;\u61b2\u0280;fgqs\u258b\u258c\u0989\u25f3\u25ff\u6264t\u0280ahlrt\u2598\u25a4\u25b7\u25c2\u25e8rrow\u0100;t\u0899\u25a1a\xe9\u24f6arpoon\u0100du\u25af\u25b4own\xbb\u045ap\xbb\u0966eftarrows;\u61c7ight\u0180ahs\u25cd\u25d6\u25derrow\u0100;s\u08f4\u08a7arpoon\xf3\u0f98quigarro\xf7\u21f0hreetimes;\u62cb\u0180;qs\u258b\u0993\u25falan\xf4\u09ac\u0280;cdgs\u09ac\u260a\u260d\u261d\u2628c;\u6aa8ot\u0100;o\u2614\u2615\u6a7f\u0100;r\u261a\u261b\u6a81;\u6a83\u0100;e\u2622\u2625\uc000\u22da\ufe00s;\u6a93\u0280adegs\u2633\u2639\u263d\u2649\u264bppro\xf8\u24c6ot;\u62d6q\u0100gq\u2643\u2645\xf4\u0989gt\xf2\u248c\xf4\u099bi\xed\u09b2\u0180ilr\u2655\u08e1\u265asht;\u697c;\uc000\ud835\udd29\u0100;E\u099c\u2663;\u6a91\u0161\u2669\u2676r\u0100du\u25b2\u266e\u0100;l\u0965\u2673;\u696alk;\u6584cy;\u4459\u0280;acht\u0a48\u2688\u268b\u2691\u2696r\xf2\u25c1orne\xf2\u1d08ard;\u696bri;\u65fa\u0100io\u269f\u26a4dot;\u4140ust\u0100;a\u26ac\u26ad\u63b0che\xbb\u26ad\u0200Eaes\u26bb\u26bd\u26c9\u26d4;\u6268p\u0100;p\u26c3\u26c4\u6a89rox\xbb\u26c4\u0100;q\u26ce\u26cf\u6a87\u0100;q\u26ce\u26bbim;\u62e6\u0400abnoptwz\u26e9\u26f4\u26f7\u271a\u272f\u2741\u2747\u2750\u0100nr\u26ee\u26f1g;\u67ecr;\u61fdr\xeb\u08c1g\u0180lmr\u26ff\u270d\u2714eft\u0100ar\u09e6\u2707ight\xe1\u09f2apsto;\u67fcight\xe1\u09fdparrow\u0100lr\u2725\u2729ef\xf4\u24edight;\u61ac\u0180afl\u2736\u2739\u273dr;\u6985;\uc000\ud835\udd5dus;\u6a2dimes;\u6a34\u0161\u274b\u274fst;\u6217\xe1\u134e\u0180;ef\u2757\u2758\u1800\u65cange\xbb\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277c\u2785\u2787r\xf2\u08a8orne\xf2\u1d8car\u0100;d\u0f98\u2783;\u696d;\u600eri;\u62bf\u0300achiqt\u2798\u279d\u0a40\u27a2\u27ae\u27bbquo;\u6039r;\uc000\ud835\udcc1m\u0180;eg\u09b2\u27aa\u27ac;\u6a8d;\u6a8f\u0100bu\u252a\u27b3o\u0100;r\u0e1f\u27b9;\u601arok;\u4142\u8400<;cdhilqr\u082b\u27d2\u2639\u27dc\u27e0\u27e5\u27ea\u27f0\u0100ci\u27d7\u27d9;\u6aa6r;\u6a79re\xe5\u25f2mes;\u62c9arr;\u6976uest;\u6a7b\u0100Pi\u27f5\u27f9ar;\u6996\u0180;ef\u2800\u092d\u181b\u65c3r\u0100du\u2807\u280dshar;\u694ahar;\u6966\u0100en\u2817\u2821rtneqq;\uc000\u2268\ufe00\xc5\u281e\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288e\u2893\u28a0\u28a5\u28a8\u28da\u28e2\u28e4\u0a83\u28f3\u2902Dot;\u623a\u0200clpr\u284e\u2852\u2863\u287dr\u803b\xaf\u40af\u0100et\u2857\u2859;\u6642\u0100;e\u285e\u285f\u6720se\xbb\u285f\u0100;s\u103b\u2868to\u0200;dlu\u103b\u2873\u2877\u287bow\xee\u048cef\xf4\u090f\xf0\u13d1ker;\u65ae\u0100oy\u2887\u288cmma;\u6a29;\u443cash;\u6014asuredangle\xbb\u1626r;\uc000\ud835\udd2ao;\u6127\u0180cdn\u28af\u28b4\u28c9ro\u803b\xb5\u40b5\u0200;acd\u1464\u28bd\u28c0\u28c4s\xf4\u16a7ir;\u6af0ot\u80bb\xb7\u01b5us\u0180;bd\u28d2\u1903\u28d3\u6212\u0100;u\u1d3c\u28d8;\u6a2a\u0163\u28de\u28e1p;\u6adb\xf2\u2212\xf0\u0a81\u0100dp\u28e9\u28eeels;\u62a7f;\uc000\ud835\udd5e\u0100ct\u28f8\u28fdr;\uc000\ud835\udcc2pos\xbb\u159d\u0180;lm\u2909\u290a\u290d\u43bctimap;\u62b8\u0c00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297e\u2989\u2998\u29da\u29e9\u2a15\u2a1a\u2a58\u2a5d\u2a83\u2a95\u2aa4\u2aa8\u2b04\u2b07\u2b44\u2b7f\u2bae\u2c34\u2c67\u2c7c\u2ce9\u0100gt\u2947\u294b;\uc000\u22d9\u0338\u0100;v\u2950\u0bcf\uc000\u226b\u20d2\u0180elt\u295a\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61cdightarrow;\u61ce;\uc000\u22d8\u0338\u0100;v\u297b\u0c47\uc000\u226a\u20d2ightarrow;\u61cf\u0100Dd\u298e\u2993ash;\u62afash;\u62ae\u0280bcnpt\u29a3\u29a7\u29ac\u29b1\u29ccla\xbb\u02deute;\u4144g;\uc000\u2220\u20d2\u0280;Eiop\u0d84\u29bc\u29c0\u29c5\u29c8;\uc000\u2a70\u0338d;\uc000\u224b\u0338s;\u4149ro\xf8\u0d84ur\u0100;a\u29d3\u29d4\u666el\u0100;s\u29d3\u0b38\u01f3\u29df\0\u29e3p\u80bb\xa0\u0b37mp\u0100;e\u0bf9\u0c00\u0280aeouy\u29f4\u29fe\u2a03\u2a10\u2a13\u01f0\u29f9\0\u29fb;\u6a43on;\u4148dil;\u4146ng\u0100;d\u0d7e\u2a0aot;\uc000\u2a6d\u0338p;\u6a42;\u443dash;\u6013\u0380;Aadqsx\u0b92\u2a29\u2a2d\u2a3b\u2a41\u2a45\u2a50rr;\u61d7r\u0100hr\u2a33\u2a36k;\u6924\u0100;o\u13f2\u13f0ot;\uc000\u2250\u0338ui\xf6\u0b63\u0100ei\u2a4a\u2a4ear;\u6928\xed\u0b98ist\u0100;s\u0ba0\u0b9fr;\uc000\ud835\udd2b\u0200Eest\u0bc5\u2a66\u2a79\u2a7c\u0180;qs\u0bbc\u2a6d\u0be1\u0180;qs\u0bbc\u0bc5\u2a74lan\xf4\u0be2i\xed\u0bea\u0100;r\u0bb6\u2a81\xbb\u0bb7\u0180Aap\u2a8a\u2a8d\u2a91r\xf2\u2971rr;\u61aear;\u6af2\u0180;sv\u0f8d\u2a9c\u0f8c\u0100;d\u2aa1\u2aa2\u62fc;\u62facy;\u445a\u0380AEadest\u2ab7\u2aba\u2abe\u2ac2\u2ac5\u2af6\u2af9r\xf2\u2966;\uc000\u2266\u0338rr;\u619ar;\u6025\u0200;fqs\u0c3b\u2ace\u2ae3\u2aeft\u0100ar\u2ad4\u2ad9rro\xf7\u2ac1ightarro\xf7\u2a90\u0180;qs\u0c3b\u2aba\u2aealan\xf4\u0c55\u0100;s\u0c55\u2af4\xbb\u0c36i\xed\u0c5d\u0100;r\u0c35\u2afei\u0100;e\u0c1a\u0c25i\xe4\u0d90\u0100pt\u2b0c\u2b11f;\uc000\ud835\udd5f\u8180\xac;in\u2b19\u2b1a\u2b36\u40acn\u0200;Edv\u0b89\u2b24\u2b28\u2b2e;\uc000\u22f9\u0338ot;\uc000\u22f5\u0338\u01e1\u0b89\u2b33\u2b35;\u62f7;\u62f6i\u0100;v\u0cb8\u2b3c\u01e1\u0cb8\u2b41\u2b43;\u62fe;\u62fd\u0180aor\u2b4b\u2b63\u2b69r\u0200;ast\u0b7b\u2b55\u2b5a\u2b5flle\xec\u0b7bl;\uc000\u2afd\u20e5;\uc000\u2202\u0338lint;\u6a14\u0180;ce\u0c92\u2b70\u2b73u\xe5\u0ca5\u0100;c\u0c98\u2b78\u0100;e\u0c92\u2b7d\xf1\u0c98\u0200Aait\u2b88\u2b8b\u2b9d\u2ba7r\xf2\u2988rr\u0180;cw\u2b94\u2b95\u2b99\u619b;\uc000\u2933\u0338;\uc000\u219d\u0338ghtarrow\xbb\u2b95ri\u0100;e\u0ccb\u0cd6\u0380chimpqu\u2bbd\u2bcd\u2bd9\u2b04\u0b78\u2be4\u2bef\u0200;cer\u0d32\u2bc6\u0d37\u2bc9u\xe5\u0d45;\uc000\ud835\udcc3ort\u026d\u2b05\0\0\u2bd6ar\xe1\u2b56m\u0100;e\u0d6e\u2bdf\u0100;q\u0d74\u0d73su\u0100bp\u2beb\u2bed\xe5\u0cf8\xe5\u0d0b\u0180bcp\u2bf6\u2c11\u2c19\u0200;Ees\u2bff\u2c00\u0d22\u2c04\u6284;\uc000\u2ac5\u0338et\u0100;e\u0d1b\u2c0bq\u0100;q\u0d23\u2c00c\u0100;e\u0d32\u2c17\xf1\u0d38\u0200;Ees\u2c22\u2c23\u0d5f\u2c27\u6285;\uc000\u2ac6\u0338et\u0100;e\u0d58\u2c2eq\u0100;q\u0d60\u2c23\u0200gilr\u2c3d\u2c3f\u2c45\u2c47\xec\u0bd7lde\u803b\xf1\u40f1\xe7\u0c43iangle\u0100lr\u2c52\u2c5ceft\u0100;e\u0c1a\u2c5a\xf1\u0c26ight\u0100;e\u0ccb\u2c65\xf1\u0cd7\u0100;m\u2c6c\u2c6d\u43bd\u0180;es\u2c74\u2c75\u2c79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2c8f\u2c94\u2c99\u2c9e\u2ca3\u2cb0\u2cb6\u2cd3\u2ce3ash;\u62adarr;\u6904p;\uc000\u224d\u20d2ash;\u62ac\u0100et\u2ca8\u2cac;\uc000\u2265\u20d2;\uc000>\u20d2nfin;\u69de\u0180Aet\u2cbd\u2cc1\u2cc5rr;\u6902;\uc000\u2264\u20d2\u0100;r\u2cca\u2ccd\uc000<\u20d2ie;\uc000\u22b4\u20d2\u0100At\u2cd8\u2cdcrr;\u6903rie;\uc000\u22b5\u20d2im;\uc000\u223c\u20d2\u0180Aan\u2cf0\u2cf4\u2d02rr;\u61d6r\u0100hr\u2cfa\u2cfdk;\u6923\u0100;o\u13e7\u13e5ear;\u6927\u1253\u1a95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2d2d\0\u2d38\u2d48\u2d60\u2d65\u2d72\u2d84\u1b07\0\0\u2d8d\u2dab\0\u2dc8\u2dce\0\u2ddc\u2e19\u2e2b\u2e3e\u2e43\u0100cs\u2d31\u1a97ute\u803b\xf3\u40f3\u0100iy\u2d3c\u2d45r\u0100;c\u1a9e\u2d42\u803b\xf4\u40f4;\u443e\u0280abios\u1aa0\u2d52\u2d57\u01c8\u2d5alac;\u4151v;\u6a38old;\u69bclig;\u4153\u0100cr\u2d69\u2d6dir;\u69bf;\uc000\ud835\udd2c\u036f\u2d79\0\0\u2d7c\0\u2d82n;\u42dbave\u803b\xf2\u40f2;\u69c1\u0100bm\u2d88\u0df4ar;\u69b5\u0200acit\u2d95\u2d98\u2da5\u2da8r\xf2\u1a80\u0100ir\u2d9d\u2da0r;\u69beoss;\u69bbn\xe5\u0e52;\u69c0\u0180aei\u2db1\u2db5\u2db9cr;\u414dga;\u43c9\u0180cdn\u2dc0\u2dc5\u01cdron;\u43bf;\u69b6pf;\uc000\ud835\udd60\u0180ael\u2dd4\u2dd7\u01d2r;\u69b7rp;\u69b9\u0380;adiosv\u2dea\u2deb\u2dee\u2e08\u2e0d\u2e10\u2e16\u6228r\xf2\u1a86\u0200;efm\u2df7\u2df8\u2e02\u2e05\u6a5dr\u0100;o\u2dfe\u2dff\u6134f\xbb\u2dff\u803b\xaa\u40aa\u803b\xba\u40bagof;\u62b6r;\u6a56lope;\u6a57;\u6a5b\u0180clo\u2e1f\u2e21\u2e27\xf2\u2e01ash\u803b\xf8\u40f8l;\u6298i\u016c\u2e2f\u2e34de\u803b\xf5\u40f5es\u0100;a\u01db\u2e3as;\u6a36ml\u803b\xf6\u40f6bar;\u633d\u0ae1\u2e5e\0\u2e7d\0\u2e80\u2e9d\0\u2ea2\u2eb9\0\0\u2ecb\u0e9c\0\u2f13\0\0\u2f2b\u2fbc\0\u2fc8r\u0200;ast\u0403\u2e67\u2e72\u0e85\u8100\xb6;l\u2e6d\u2e6e\u40b6le\xec\u0403\u0269\u2e78\0\0\u2e7bm;\u6af3;\u6afdy;\u443fr\u0280cimpt\u2e8b\u2e8f\u2e93\u1865\u2e97nt;\u4025od;\u402eil;\u6030enk;\u6031r;\uc000\ud835\udd2d\u0180imo\u2ea8\u2eb0\u2eb4\u0100;v\u2ead\u2eae\u43c6;\u43d5ma\xf4\u0a76ne;\u660e\u0180;tv\u2ebf\u2ec0\u2ec8\u43c0chfork\xbb\u1ffd;\u43d6\u0100au\u2ecf\u2edfn\u0100ck\u2ed5\u2eddk\u0100;h\u21f4\u2edb;\u610e\xf6\u21f4s\u0480;abcdemst\u2ef3\u2ef4\u1908\u2ef9\u2efd\u2f04\u2f06\u2f0a\u2f0e\u402bcir;\u6a23ir;\u6a22\u0100ou\u1d40\u2f02;\u6a25;\u6a72n\u80bb\xb1\u0e9dim;\u6a26wo;\u6a27\u0180ipu\u2f19\u2f20\u2f25ntint;\u6a15f;\uc000\ud835\udd61nd\u803b\xa3\u40a3\u0500;Eaceinosu\u0ec8\u2f3f\u2f41\u2f44\u2f47\u2f81\u2f89\u2f92\u2f7e\u2fb6;\u6ab3p;\u6ab7u\xe5\u0ed9\u0100;c\u0ece\u2f4c\u0300;acens\u0ec8\u2f59\u2f5f\u2f66\u2f68\u2f7eppro\xf8\u2f43urlye\xf1\u0ed9\xf1\u0ece\u0180aes\u2f6f\u2f76\u2f7approx;\u6ab9qq;\u6ab5im;\u62e8i\xed\u0edfme\u0100;s\u2f88\u0eae\u6032\u0180Eas\u2f78\u2f90\u2f7a\xf0\u2f75\u0180dfp\u0eec\u2f99\u2faf\u0180als\u2fa0\u2fa5\u2faalar;\u632eine;\u6312urf;\u6313\u0100;t\u0efb\u2fb4\xef\u0efbrel;\u62b0\u0100ci\u2fc0\u2fc5r;\uc000\ud835\udcc5;\u43c8ncsp;\u6008\u0300fiopsu\u2fda\u22e2\u2fdf\u2fe5\u2feb\u2ff1r;\uc000\ud835\udd2epf;\uc000\ud835\udd62rime;\u6057cr;\uc000\ud835\udcc6\u0180aeo\u2ff8\u3009\u3013t\u0100ei\u2ffe\u3005rnion\xf3\u06b0nt;\u6a16st\u0100;e\u3010\u3011\u403f\xf1\u1f19\xf4\u0f14\u0a80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30e0\u310e\u312b\u3147\u3162\u3172\u318e\u3206\u3215\u3224\u3229\u3258\u326e\u3272\u3290\u32b0\u32b7\u0180art\u3047\u304a\u304cr\xf2\u10b3\xf2\u03ddail;\u691car\xf2\u1c65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307f\u308f\u3094\u30cc\u0100eu\u306d\u3071;\uc000\u223d\u0331te;\u4155i\xe3\u116emptyv;\u69b3g\u0200;del\u0fd1\u3089\u308b\u308d;\u6992;\u69a5\xe5\u0fd1uo\u803b\xbb\u40bbr\u0580;abcfhlpstw\u0fdc\u30ac\u30af\u30b7\u30b9\u30bc\u30be\u30c0\u30c3\u30c7\u30cap;\u6975\u0100;f\u0fe0\u30b4s;\u6920;\u6933s;\u691e\xeb\u225d\xf0\u272el;\u6945im;\u6974l;\u61a3;\u619d\u0100ai\u30d1\u30d5il;\u691ao\u0100;n\u30db\u30dc\u6236al\xf3\u0f1e\u0180abr\u30e7\u30ea\u30eer\xf2\u17e5rk;\u6773\u0100ak\u30f3\u30fdc\u0100ek\u30f9\u30fb;\u407d;\u405d\u0100es\u3102\u3104;\u698cl\u0100du\u310a\u310c;\u698e;\u6990\u0200aeuy\u3117\u311c\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xec\u0ff2\xe2\u30fa;\u4440\u0200clqs\u3134\u3137\u313d\u3144a;\u6937dhar;\u6969uo\u0100;r\u020e\u020dh;\u61b3\u0180acg\u314e\u315f\u0f44l\u0200;ips\u0f78\u3158\u315b\u109cn\xe5\u10bbar\xf4\u0fa9t;\u65ad\u0180ilr\u3169\u1023\u316esht;\u697d;\uc000\ud835\udd2f\u0100ao\u3177\u3186r\u0100du\u317d\u317f\xbb\u047b\u0100;l\u1091\u3184;\u696c\u0100;v\u318b\u318c\u43c1;\u43f1\u0180gns\u3195\u31f9\u31fcht\u0300ahlrst\u31a4\u31b0\u31c2\u31d8\u31e4\u31eerrow\u0100;t\u0fdc\u31ada\xe9\u30c8arpoon\u0100du\u31bb\u31bfow\xee\u317ep\xbb\u1092eft\u0100ah\u31ca\u31d0rrow\xf3\u0feaarpoon\xf3\u0551ightarrows;\u61c9quigarro\xf7\u30cbhreetimes;\u62ccg;\u42daingdotse\xf1\u1f32\u0180ahm\u320d\u3210\u3213r\xf2\u0feaa\xf2\u0551;\u600foust\u0100;a\u321e\u321f\u63b1che\xbb\u321fmid;\u6aee\u0200abpt\u3232\u323d\u3240\u3252\u0100nr\u3237\u323ag;\u67edr;\u61fer\xeb\u1003\u0180afl\u3247\u324a\u324er;\u6986;\uc000\ud835\udd63us;\u6a2eimes;\u6a35\u0100ap\u325d\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6a12ar\xf2\u31e3\u0200achq\u327b\u3280\u10bc\u3285quo;\u603ar;\uc000\ud835\udcc7\u0100bu\u30fb\u328ao\u0100;r\u0214\u0213\u0180hir\u3297\u329b\u32a0re\xe5\u31f8mes;\u62cai\u0200;efl\u32aa\u1059\u1821\u32ab\u65b9tri;\u69celuhar;\u6968;\u611e\u0d61\u32d5\u32db\u32df\u332c\u3338\u3371\0\u337a\u33a4\0\0\u33ec\u33f0\0\u3428\u3448\u345a\u34ad\u34b1\u34ca\u34f1\0\u3616\0\0\u3633cute;\u415bqu\xef\u27ba\u0500;Eaceinpsy\u11ed\u32f3\u32f5\u32ff\u3302\u330b\u330f\u331f\u3326\u3329;\u6ab4\u01f0\u32fa\0\u32fc;\u6ab8on;\u4161u\xe5\u11fe\u0100;d\u11f3\u3307il;\u415frc;\u415d\u0180Eas\u3316\u3318\u331b;\u6ab6p;\u6abaim;\u62e9olint;\u6a13i\xed\u1204;\u4441ot\u0180;be\u3334\u1d47\u3335\u62c5;\u6a66\u0380Aacmstx\u3346\u334a\u3357\u335b\u335e\u3363\u336drr;\u61d8r\u0100hr\u3350\u3352\xeb\u2228\u0100;o\u0a36\u0a34t\u803b\xa7\u40a7i;\u403bwar;\u6929m\u0100in\u3369\xf0nu\xf3\xf1t;\u6736r\u0100;o\u3376\u2055\uc000\ud835\udd30\u0200acoy\u3382\u3386\u3391\u33a0rp;\u666f\u0100hy\u338b\u338fcy;\u4449;\u4448rt\u026d\u3399\0\0\u339ci\xe4\u1464ara\xec\u2e6f\u803b\xad\u40ad\u0100gm\u33a8\u33b4ma\u0180;fv\u33b1\u33b2\u33b2\u43c3;\u43c2\u0400;deglnpr\u12ab\u33c5\u33c9\u33ce\u33d6\u33de\u33e1\u33e6ot;\u6a6a\u0100;q\u12b1\u12b0\u0100;E\u33d3\u33d4\u6a9e;\u6aa0\u0100;E\u33db\u33dc\u6a9d;\u6a9fe;\u6246lus;\u6a24arr;\u6972ar\xf2\u113d\u0200aeit\u33f8\u3408\u340f\u3417\u0100ls\u33fd\u3404lsetm\xe9\u336ahp;\u6a33parsl;\u69e4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341c\u341d\u6aaa\u0100;s\u3422\u3423\u6aac;\uc000\u2aac\ufe00\u0180flp\u342e\u3433\u3442tcy;\u444c\u0100;b\u3438\u3439\u402f\u0100;a\u343e\u343f\u69c4r;\u633ff;\uc000\ud835\udd64a\u0100dr\u344d\u0402es\u0100;u\u3454\u3455\u6660it\xbb\u3455\u0180csu\u3460\u3479\u349f\u0100au\u3465\u346fp\u0100;s\u1188\u346b;\uc000\u2293\ufe00p\u0100;s\u11b4\u3475;\uc000\u2294\ufe00u\u0100bp\u347f\u348f\u0180;es\u1197\u119c\u3486et\u0100;e\u1197\u348d\xf1\u119d\u0180;es\u11a8\u11ad\u3496et\u0100;e\u11a8\u349d\xf1\u11ae\u0180;af\u117b\u34a6\u05b0r\u0165\u34ab\u05b1\xbb\u117car\xf2\u1148\u0200cemt\u34b9\u34be\u34c2\u34c5r;\uc000\ud835\udcc8tm\xee\xf1i\xec\u3415ar\xe6\u11be\u0100ar\u34ce\u34d5r\u0100;f\u34d4\u17bf\u6606\u0100an\u34da\u34edight\u0100ep\u34e3\u34eapsilo\xee\u1ee0h\xe9\u2eafs\xbb\u2852\u0280bcmnp\u34fb\u355e\u1209\u358b\u358e\u0480;Edemnprs\u350e\u350f\u3511\u3515\u351e\u3523\u352c\u3531\u3536\u6282;\u6ac5ot;\u6abd\u0100;d\u11da\u351aot;\u6ac3ult;\u6ac1\u0100Ee\u3528\u352a;\u6acb;\u628alus;\u6abfarr;\u6979\u0180eiu\u353d\u3552\u3555t\u0180;en\u350e\u3545\u354bq\u0100;q\u11da\u350feq\u0100;q\u352b\u3528m;\u6ac7\u0100bp\u355a\u355c;\u6ad5;\u6ad3c\u0300;acens\u11ed\u356c\u3572\u3579\u357b\u3326ppro\xf8\u32faurlye\xf1\u11fe\xf1\u11f3\u0180aes\u3582\u3588\u331bppro\xf8\u331aq\xf1\u3317g;\u666a\u0680123;Edehlmnps\u35a9\u35ac\u35af\u121c\u35b2\u35b4\u35c0\u35c9\u35d5\u35da\u35df\u35e8\u35ed\u803b\xb9\u40b9\u803b\xb2\u40b2\u803b\xb3\u40b3;\u6ac6\u0100os\u35b9\u35bct;\u6abeub;\u6ad8\u0100;d\u1222\u35c5ot;\u6ac4s\u0100ou\u35cf\u35d2l;\u67c9b;\u6ad7arr;\u697bult;\u6ac2\u0100Ee\u35e4\u35e6;\u6acc;\u628blus;\u6ac0\u0180eiu\u35f4\u3609\u360ct\u0180;en\u121c\u35fc\u3602q\u0100;q\u1222\u35b2eq\u0100;q\u35e7\u35e4m;\u6ac8\u0100bp\u3611\u3613;\u6ad4;\u6ad6\u0180Aan\u361c\u3620\u362drr;\u61d9r\u0100hr\u3626\u3628\xeb\u222e\u0100;o\u0a2b\u0a29war;\u692alig\u803b\xdf\u40df\u0be1\u3651\u365d\u3660\u12ce\u3673\u3679\0\u367e\u36c2\0\0\0\0\0\u36db\u3703\0\u3709\u376c\0\0\0\u3787\u0272\u3656\0\0\u365bget;\u6316;\u43c4r\xeb\u0e5f\u0180aey\u3666\u366b\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uc000\ud835\udd31\u0200eiko\u3686\u369d\u36b5\u36bc\u01f2\u368b\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369b\u43b8ym;\u43d1\u0100cn\u36a2\u36b2k\u0100as\u36a8\u36aeppro\xf8\u12c1im\xbb\u12acs\xf0\u129e\u0100as\u36ba\u36ae\xf0\u12c1rn\u803b\xfe\u40fe\u01ec\u031f\u36c6\u22e7es\u8180\xd7;bd\u36cf\u36d0\u36d8\u40d7\u0100;a\u190f\u36d5r;\u6a31;\u6a30\u0180eps\u36e1\u36e3\u3700\xe1\u2a4d\u0200;bcf\u0486\u36ec\u36f0\u36f4ot;\u6336ir;\u6af1\u0100;o\u36f9\u36fc\uc000\ud835\udd65rk;\u6ada\xe1\u3362rime;\u6034\u0180aip\u370f\u3712\u3764d\xe5\u1248\u0380adempst\u3721\u374d\u3740\u3751\u3757\u375c\u375fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65b5own\xbb\u1dbbeft\u0100;e\u2800\u373e\xf1\u092e;\u625cight\u0100;e\u32aa\u374b\xf1\u105aot;\u65ecinus;\u6a3alus;\u6a39b;\u69cdime;\u6a3bezium;\u63e2\u0180cht\u3772\u377d\u3781\u0100ry\u3777\u377b;\uc000\ud835\udcc9;\u4446cy;\u445brok;\u4167\u0100io\u378b\u378ex\xf4\u1777head\u0100lr\u3797\u37a0eftarro\xf7\u084fightarrow\xbb\u0f5d\u0900AHabcdfghlmoprstuw\u37d0\u37d3\u37d7\u37e4\u37f0\u37fc\u380e\u381c\u3823\u3834\u3851\u385d\u386b\u38a9\u38cc\u38d2\u38ea\u38f6r\xf2\u03edar;\u6963\u0100cr\u37dc\u37e2ute\u803b\xfa\u40fa\xf2\u1150r\u01e3\u37ea\0\u37edy;\u445eve;\u416d\u0100iy\u37f5\u37farc\u803b\xfb\u40fb;\u4443\u0180abh\u3803\u3806\u380br\xf2\u13adlac;\u4171a\xf2\u13c3\u0100ir\u3813\u3818sht;\u697e;\uc000\ud835\udd32rave\u803b\xf9\u40f9\u0161\u3827\u3831r\u0100lr\u382c\u382e\xbb\u0957\xbb\u1083lk;\u6580\u0100ct\u3839\u384d\u026f\u383f\0\0\u384arn\u0100;e\u3845\u3846\u631cr\xbb\u3846op;\u630fri;\u65f8\u0100al\u3856\u385acr;\u416b\u80bb\xa8\u0349\u0100gp\u3862\u3866on;\u4173f;\uc000\ud835\udd66\u0300adhlsu\u114b\u3878\u387d\u1372\u3891\u38a0own\xe1\u13b3arpoon\u0100lr\u3888\u388cef\xf4\u382digh\xf4\u382fi\u0180;hl\u3899\u389a\u389c\u43c5\xbb\u13faon\xbb\u389aparrows;\u61c8\u0180cit\u38b0\u38c4\u38c8\u026f\u38b6\0\0\u38c1rn\u0100;e\u38bc\u38bd\u631dr\xbb\u38bdop;\u630eng;\u416fri;\u65f9cr;\uc000\ud835\udcca\u0180dir\u38d9\u38dd\u38e2ot;\u62f0lde;\u4169i\u0100;f\u3730\u38e8\xbb\u1813\u0100am\u38ef\u38f2r\xf2\u38a8l\u803b\xfc\u40fcangle;\u69a7\u0780ABDacdeflnoprsz\u391c\u391f\u3929\u392d\u39b5\u39b8\u39bd\u39df\u39e4\u39e8\u39f3\u39f9\u39fd\u3a01\u3a20r\xf2\u03f7ar\u0100;v\u3926\u3927\u6ae8;\u6ae9as\xe8\u03e1\u0100nr\u3932\u3937grt;\u699c\u0380eknprst\u34e3\u3946\u394b\u3952\u395d\u3964\u3996app\xe1\u2415othin\xe7\u1e96\u0180hir\u34eb\u2ec8\u3959op\xf4\u2fb5\u0100;h\u13b7\u3962\xef\u318d\u0100iu\u3969\u396dgm\xe1\u33b3\u0100bp\u3972\u3984setneq\u0100;q\u397d\u3980\uc000\u228a\ufe00;\uc000\u2acb\ufe00setneq\u0100;q\u398f\u3992\uc000\u228b\ufe00;\uc000\u2acc\ufe00\u0100hr\u399b\u399fet\xe1\u369ciangle\u0100lr\u39aa\u39afeft\xbb\u0925ight\xbb\u1051y;\u4432ash\xbb\u1036\u0180elr\u39c4\u39d2\u39d7\u0180;be\u2dea\u39cb\u39cfar;\u62bbq;\u625alip;\u62ee\u0100bt\u39dc\u1468a\xf2\u1469r;\uc000\ud835\udd33tr\xe9\u39aesu\u0100bp\u39ef\u39f1\xbb\u0d1c\xbb\u0d59pf;\uc000\ud835\udd67ro\xf0\u0efbtr\xe9\u39b4\u0100cu\u3a06\u3a0br;\uc000\ud835\udccb\u0100bp\u3a10\u3a18n\u0100Ee\u3980\u3a16\xbb\u397en\u0100Ee\u3992\u3a1e\xbb\u3990igzag;\u699a\u0380cefoprs\u3a36\u3a3b\u3a56\u3a5b\u3a54\u3a61\u3a6airc;\u4175\u0100di\u3a40\u3a51\u0100bg\u3a45\u3a49ar;\u6a5fe\u0100;q\u15fa\u3a4f;\u6259erp;\u6118r;\uc000\ud835\udd34pf;\uc000\ud835\udd68\u0100;e\u1479\u3a66at\xe8\u1479cr;\uc000\ud835\udccc\u0ae3\u178e\u3a87\0\u3a8b\0\u3a90\u3a9b\0\0\u3a9d\u3aa8\u3aab\u3aaf\0\0\u3ac3\u3ace\0\u3ad8\u17dc\u17dftr\xe9\u17d1r;\uc000\ud835\udd35\u0100Aa\u3a94\u3a97r\xf2\u03c3r\xf2\u09f6;\u43be\u0100Aa\u3aa1\u3aa4r\xf2\u03b8r\xf2\u09eba\xf0\u2713is;\u62fb\u0180dpt\u17a4\u3ab5\u3abe\u0100fl\u3aba\u17a9;\uc000\ud835\udd69im\xe5\u17b2\u0100Aa\u3ac7\u3acar\xf2\u03cer\xf2\u0a01\u0100cq\u3ad2\u17b8r;\uc000\ud835\udccd\u0100pt\u17d6\u3adcr\xe9\u17d4\u0400acefiosu\u3af0\u3afd\u3b08\u3b0c\u3b11\u3b15\u3b1b\u3b21c\u0100uy\u3af6\u3afbte\u803b\xfd\u40fd;\u444f\u0100iy\u3b02\u3b06rc;\u4177;\u444bn\u803b\xa5\u40a5r;\uc000\ud835\udd36cy;\u4457pf;\uc000\ud835\udd6acr;\uc000\ud835\udcce\u0100cm\u3b26\u3b29y;\u444el\u803b\xff\u40ff\u0500acdefhiosw\u3b42\u3b48\u3b54\u3b58\u3b64\u3b69\u3b6d\u3b74\u3b7a\u3b80cute;\u417a\u0100ay\u3b4d\u3b52ron;\u417e;\u4437ot;\u417c\u0100et\u3b5d\u3b61tr\xe6\u155fa;\u43b6r;\uc000\ud835\udd37cy;\u4436grarr;\u61ddpf;\uc000\ud835\udd6bcr;\uc000\ud835\udccf\u0100jn\u3b85\u3b87;\u600dj;\u600c"
    .split("")
    .map((c) => c.charCodeAt(0)));

// Generated using scripts/write-decode-map.ts
var xmlDecodeTree = new Uint16Array(
// prettier-ignore
"\u0200aglq\t\x15\x18\x1b\u026d\x0f\0\0\x12p;\u4026os;\u4027t;\u403et;\u403cuot;\u4022"
    .split("")
    .map((c) => c.charCodeAt(0)));

// Adapted from https://github.com/mathiasbynens/he/blob/36afe179392226cf1b6ccdb16ebbb7a5a844d93a/src/he.js#L106-L134
var _a;
const decodeMap = new Map([
    [0, 65533],
    // C1 Unicode control character reference replacements
    [128, 8364],
    [130, 8218],
    [131, 402],
    [132, 8222],
    [133, 8230],
    [134, 8224],
    [135, 8225],
    [136, 710],
    [137, 8240],
    [138, 352],
    [139, 8249],
    [140, 338],
    [142, 381],
    [145, 8216],
    [146, 8217],
    [147, 8220],
    [148, 8221],
    [149, 8226],
    [150, 8211],
    [151, 8212],
    [152, 732],
    [153, 8482],
    [154, 353],
    [155, 8250],
    [156, 339],
    [158, 382],
    [159, 376],
]);
/**
 * Polyfill for `String.fromCodePoint`. It is used to create a string from a Unicode code point.
 */
const fromCodePoint$1 = 
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
(_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function (codePoint) {
    let output = "";
    if (codePoint > 0xffff) {
        codePoint -= 0x10000;
        output += String.fromCharCode(((codePoint >>> 10) & 0x3ff) | 0xd800);
        codePoint = 0xdc00 | (codePoint & 0x3ff);
    }
    output += String.fromCharCode(codePoint);
    return output;
};
/**
 * Replace the given code point with a replacement character if it is a
 * surrogate or is outside the valid range. Otherwise return the code
 * point unchanged.
 */
function replaceCodePoint(codePoint) {
    var _a;
    if ((codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
        return 0xfffd;
    }
    return (_a = decodeMap.get(codePoint)) !== null && _a !== void 0 ? _a : codePoint;
}

var CharCodes;
(function (CharCodes) {
    CharCodes[CharCodes["NUM"] = 35] = "NUM";
    CharCodes[CharCodes["SEMI"] = 59] = "SEMI";
    CharCodes[CharCodes["EQUALS"] = 61] = "EQUALS";
    CharCodes[CharCodes["ZERO"] = 48] = "ZERO";
    CharCodes[CharCodes["NINE"] = 57] = "NINE";
    CharCodes[CharCodes["LOWER_A"] = 97] = "LOWER_A";
    CharCodes[CharCodes["LOWER_F"] = 102] = "LOWER_F";
    CharCodes[CharCodes["LOWER_X"] = 120] = "LOWER_X";
    CharCodes[CharCodes["LOWER_Z"] = 122] = "LOWER_Z";
    CharCodes[CharCodes["UPPER_A"] = 65] = "UPPER_A";
    CharCodes[CharCodes["UPPER_F"] = 70] = "UPPER_F";
    CharCodes[CharCodes["UPPER_Z"] = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
/** Bit that needs to be set to convert an upper case ASCII character to lower case */
const TO_LOWER_BIT = 0b100000;
var BinTrieFlags;
(function (BinTrieFlags) {
    BinTrieFlags[BinTrieFlags["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
    BinTrieFlags[BinTrieFlags["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
    BinTrieFlags[BinTrieFlags["JUMP_TABLE"] = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));
function isNumber(code) {
    return code >= CharCodes.ZERO && code <= CharCodes.NINE;
}
function isHexadecimalCharacter(code) {
    return ((code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F) ||
        (code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F));
}
function isAsciiAlphaNumeric(code) {
    return ((code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z) ||
        (code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z) ||
        isNumber(code));
}
/**
 * Checks if the given character is a valid end character for an entity in an attribute.
 *
 * Attribute values that aren't terminated properly aren't parsed, and shouldn't lead to a parser error.
 * See the example in https://html.spec.whatwg.org/multipage/parsing.html#named-character-reference-state
 */
function isEntityInAttributeInvalidEnd(code) {
    return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
}
var EntityDecoderState;
(function (EntityDecoderState) {
    EntityDecoderState[EntityDecoderState["EntityStart"] = 0] = "EntityStart";
    EntityDecoderState[EntityDecoderState["NumericStart"] = 1] = "NumericStart";
    EntityDecoderState[EntityDecoderState["NumericDecimal"] = 2] = "NumericDecimal";
    EntityDecoderState[EntityDecoderState["NumericHex"] = 3] = "NumericHex";
    EntityDecoderState[EntityDecoderState["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function (DecodingMode) {
    /** Entities in text nodes that can end with any character. */
    DecodingMode[DecodingMode["Legacy"] = 0] = "Legacy";
    /** Only allow entities terminated with a semicolon. */
    DecodingMode[DecodingMode["Strict"] = 1] = "Strict";
    /** Entities in attributes have limitations on ending characters. */
    DecodingMode[DecodingMode["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
/**
 * Token decoder with support of writing partial entities.
 */
class EntityDecoder {
    constructor(
    /** The tree used to decode entities. */
    decodeTree, 
    /**
     * The function that is called when a codepoint is decoded.
     *
     * For multi-byte named entities, this will be called multiple times,
     * with the second codepoint, and the same `consumed` value.
     *
     * @param codepoint The decoded codepoint.
     * @param consumed The number of bytes consumed by the decoder.
     */
    emitCodePoint, 
    /** An object that is used to produce errors. */
    errors) {
        this.decodeTree = decodeTree;
        this.emitCodePoint = emitCodePoint;
        this.errors = errors;
        /** The current state of the decoder. */
        this.state = EntityDecoderState.EntityStart;
        /** Characters that were consumed while parsing an entity. */
        this.consumed = 1;
        /**
         * The result of the entity.
         *
         * Either the result index of a numeric entity, or the codepoint of a
         * numeric entity.
         */
        this.result = 0;
        /** The current index in the decode tree. */
        this.treeIndex = 0;
        /** The number of characters that were consumed in excess. */
        this.excess = 1;
        /** The mode in which the decoder is operating. */
        this.decodeMode = DecodingMode.Strict;
    }
    /** Resets the instance to make it reusable. */
    startEntity(decodeMode) {
        this.decodeMode = decodeMode;
        this.state = EntityDecoderState.EntityStart;
        this.result = 0;
        this.treeIndex = 0;
        this.excess = 1;
        this.consumed = 1;
    }
    /**
     * Write an entity to the decoder. This can be called multiple times with partial entities.
     * If the entity is incomplete, the decoder will return -1.
     *
     * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
     * entity is incomplete, and resume when the next string is written.
     *
     * @param string The string containing the entity (or a continuation of the entity).
     * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    write(str, offset) {
        switch (this.state) {
            case EntityDecoderState.EntityStart: {
                if (str.charCodeAt(offset) === CharCodes.NUM) {
                    this.state = EntityDecoderState.NumericStart;
                    this.consumed += 1;
                    return this.stateNumericStart(str, offset + 1);
                }
                this.state = EntityDecoderState.NamedEntity;
                return this.stateNamedEntity(str, offset);
            }
            case EntityDecoderState.NumericStart: {
                return this.stateNumericStart(str, offset);
            }
            case EntityDecoderState.NumericDecimal: {
                return this.stateNumericDecimal(str, offset);
            }
            case EntityDecoderState.NumericHex: {
                return this.stateNumericHex(str, offset);
            }
            case EntityDecoderState.NamedEntity: {
                return this.stateNamedEntity(str, offset);
            }
        }
    }
    /**
     * Switches between the numeric decimal and hexadecimal states.
     *
     * Equivalent to the `Numeric character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericStart(str, offset) {
        if (offset >= str.length) {
            return -1;
        }
        if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
            this.state = EntityDecoderState.NumericHex;
            this.consumed += 1;
            return this.stateNumericHex(str, offset + 1);
        }
        this.state = EntityDecoderState.NumericDecimal;
        return this.stateNumericDecimal(str, offset);
    }
    addToNumericResult(str, start, end, base) {
        if (start !== end) {
            const digitCount = end - start;
            this.result =
                this.result * Math.pow(base, digitCount) +
                    parseInt(str.substr(start, digitCount), base);
            this.consumed += digitCount;
        }
    }
    /**
     * Parses a hexadecimal numeric entity.
     *
     * Equivalent to the `Hexademical character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericHex(str, offset) {
        const startIdx = offset;
        while (offset < str.length) {
            const char = str.charCodeAt(offset);
            if (isNumber(char) || isHexadecimalCharacter(char)) {
                offset += 1;
            }
            else {
                this.addToNumericResult(str, startIdx, offset, 16);
                return this.emitNumericEntity(char, 3);
            }
        }
        this.addToNumericResult(str, startIdx, offset, 16);
        return -1;
    }
    /**
     * Parses a decimal numeric entity.
     *
     * Equivalent to the `Decimal character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericDecimal(str, offset) {
        const startIdx = offset;
        while (offset < str.length) {
            const char = str.charCodeAt(offset);
            if (isNumber(char)) {
                offset += 1;
            }
            else {
                this.addToNumericResult(str, startIdx, offset, 10);
                return this.emitNumericEntity(char, 2);
            }
        }
        this.addToNumericResult(str, startIdx, offset, 10);
        return -1;
    }
    /**
     * Validate and emit a numeric entity.
     *
     * Implements the logic from the `Hexademical character reference start
     * state` and `Numeric character reference end state` in the HTML spec.
     *
     * @param lastCp The last code point of the entity. Used to see if the
     *               entity was terminated with a semicolon.
     * @param expectedLength The minimum number of characters that should be
     *                       consumed. Used to validate that at least one digit
     *                       was consumed.
     * @returns The number of characters that were consumed.
     */
    emitNumericEntity(lastCp, expectedLength) {
        var _a;
        // Ensure we consumed at least one digit.
        if (this.consumed <= expectedLength) {
            (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
            return 0;
        }
        // Figure out if this is a legit end of the entity
        if (lastCp === CharCodes.SEMI) {
            this.consumed += 1;
        }
        else if (this.decodeMode === DecodingMode.Strict) {
            return 0;
        }
        this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
        if (this.errors) {
            if (lastCp !== CharCodes.SEMI) {
                this.errors.missingSemicolonAfterCharacterReference();
            }
            this.errors.validateNumericCharacterReference(this.result);
        }
        return this.consumed;
    }
    /**
     * Parses a named entity.
     *
     * Equivalent to the `Named character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNamedEntity(str, offset) {
        const { decodeTree } = this;
        let current = decodeTree[this.treeIndex];
        // The mask is the number of bytes of the value, including the current byte.
        let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
        for (; offset < str.length; offset++, this.excess++) {
            const char = str.charCodeAt(offset);
            this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
            if (this.treeIndex < 0) {
                return this.result === 0 ||
                    // If we are parsing an attribute
                    (this.decodeMode === DecodingMode.Attribute &&
                        // We shouldn't have consumed any characters after the entity,
                        (valueLength === 0 ||
                            // And there should be no invalid characters.
                            isEntityInAttributeInvalidEnd(char)))
                    ? 0
                    : this.emitNotTerminatedNamedEntity();
            }
            current = decodeTree[this.treeIndex];
            valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
            // If the branch is a value, store it and continue
            if (valueLength !== 0) {
                // If the entity is terminated by a semicolon, we are done.
                if (char === CharCodes.SEMI) {
                    return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
                }
                // If we encounter a non-terminated (legacy) entity while parsing strictly, then ignore it.
                if (this.decodeMode !== DecodingMode.Strict) {
                    this.result = this.treeIndex;
                    this.consumed += this.excess;
                    this.excess = 0;
                }
            }
        }
        return -1;
    }
    /**
     * Emit a named entity that was not terminated with a semicolon.
     *
     * @returns The number of characters consumed.
     */
    emitNotTerminatedNamedEntity() {
        var _a;
        const { result, decodeTree } = this;
        const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
        this.emitNamedEntityData(result, valueLength, this.consumed);
        (_a = this.errors) === null || _a === void 0 ? void 0 : _a.missingSemicolonAfterCharacterReference();
        return this.consumed;
    }
    /**
     * Emit a named entity.
     *
     * @param result The index of the entity in the decode tree.
     * @param valueLength The number of bytes in the entity.
     * @param consumed The number of characters consumed.
     *
     * @returns The number of characters consumed.
     */
    emitNamedEntityData(result, valueLength, consumed) {
        const { decodeTree } = this;
        this.emitCodePoint(valueLength === 1
            ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH
            : decodeTree[result + 1], consumed);
        if (valueLength === 3) {
            // For multi-byte values, we need to emit the second byte.
            this.emitCodePoint(decodeTree[result + 2], consumed);
        }
        return consumed;
    }
    /**
     * Signal to the parser that the end of the input was reached.
     *
     * Remaining data will be emitted and relevant errors will be produced.
     *
     * @returns The number of characters consumed.
     */
    end() {
        var _a;
        switch (this.state) {
            case EntityDecoderState.NamedEntity: {
                // Emit a named entity if we have one.
                return this.result !== 0 &&
                    (this.decodeMode !== DecodingMode.Attribute ||
                        this.result === this.treeIndex)
                    ? this.emitNotTerminatedNamedEntity()
                    : 0;
            }
            // Otherwise, emit a numeric entity if we have one.
            case EntityDecoderState.NumericDecimal: {
                return this.emitNumericEntity(0, 2);
            }
            case EntityDecoderState.NumericHex: {
                return this.emitNumericEntity(0, 3);
            }
            case EntityDecoderState.NumericStart: {
                (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
                return 0;
            }
            case EntityDecoderState.EntityStart: {
                // Return 0 if we have no entity.
                return 0;
            }
        }
    }
}
/**
 * Creates a function that decodes entities in a string.
 *
 * @param decodeTree The decode tree.
 * @returns A function that decodes entities in a string.
 */
function getDecoder(decodeTree) {
    let ret = "";
    const decoder = new EntityDecoder(decodeTree, (str) => (ret += fromCodePoint$1(str)));
    return function decodeWithTrie(str, decodeMode) {
        let lastIndex = 0;
        let offset = 0;
        while ((offset = str.indexOf("&", offset)) >= 0) {
            ret += str.slice(lastIndex, offset);
            decoder.startEntity(decodeMode);
            const len = decoder.write(str, 
            // Skip the "&"
            offset + 1);
            if (len < 0) {
                lastIndex = offset + decoder.end();
                break;
            }
            lastIndex = offset + len;
            // If `len` is 0, skip the current `&` and continue.
            offset = len === 0 ? lastIndex + 1 : lastIndex;
        }
        const result = ret + str.slice(lastIndex);
        // Make sure we don't keep a reference to the final string.
        ret = "";
        return result;
    };
}
/**
 * Determines the branch of the current node that is taken given the current
 * character. This function is used to traverse the trie.
 *
 * @param decodeTree The trie.
 * @param current The current node.
 * @param nodeIdx The index right after the current node and its value.
 * @param char The current character.
 * @returns The index of the next node, or -1 if no branch is taken.
 */
function determineBranch(decodeTree, current, nodeIdx, char) {
    const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
    const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
    // Case 1: Single branch encoded in jump offset
    if (branchCount === 0) {
        return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
    }
    // Case 2: Multiple branches encoded in jump table
    if (jumpOffset) {
        const value = char - jumpOffset;
        return value < 0 || value >= branchCount
            ? -1
            : decodeTree[nodeIdx + value] - 1;
    }
    // Case 3: Multiple branches encoded in dictionary
    // Binary search for the character.
    let lo = nodeIdx;
    let hi = lo + branchCount - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const midVal = decodeTree[mid];
        if (midVal < char) {
            lo = mid + 1;
        }
        else if (midVal > char) {
            hi = mid - 1;
        }
        else {
            return decodeTree[mid + branchCount];
        }
    }
    return -1;
}
const htmlDecoder = getDecoder(htmlDecodeTree);
getDecoder(xmlDecodeTree);
/**
 * Decodes an HTML string.
 *
 * @param str The string to decode.
 * @param mode The decoding mode.
 * @returns The decoded string.
 */
function decodeHTML(str, mode = DecodingMode.Legacy) {
    return htmlDecoder(str, mode);
}
/**
 * Decodes an HTML string, requiring all entities to be terminated by a semicolon.
 *
 * @param str The string to decode.
 * @returns The decoded string.
 */
function decodeHTMLStrict(str) {
    return htmlDecoder(str, DecodingMode.Strict);
}

// Utilities
//


function _class$1 (obj) { return Object.prototype.toString.call(obj) }

function isString$1 (obj) { return _class$1(obj) === '[object String]' }

const _hasOwnProperty = Object.prototype.hasOwnProperty;

function has (object, key) {
  return _hasOwnProperty.call(object, key)
}

// Merge objects
//
function assign$1 (obj /* from1, from2, from3, ... */) {
  const sources = Array.prototype.slice.call(arguments, 1);

  sources.forEach(function (source) {
    if (!source) { return }

    if (typeof source !== 'object') {
      throw new TypeError(source + 'must be object')
    }

    Object.keys(source).forEach(function (key) {
      obj[key] = source[key];
    });
  });

  return obj
}

// Remove element from array and put another array at those position.
// Useful for some operations with tokens
function arrayReplaceAt (src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1))
}

function isValidEntityCode (c) {
  /* eslint no-bitwise:0 */
  // broken sequence
  if (c >= 0xD800 && c <= 0xDFFF) { return false }
  // never used
  if (c >= 0xFDD0 && c <= 0xFDEF) { return false }
  if ((c & 0xFFFF) === 0xFFFF || (c & 0xFFFF) === 0xFFFE) { return false }
  // control codes
  if (c >= 0x00 && c <= 0x08) { return false }
  if (c === 0x0B) { return false }
  if (c >= 0x0E && c <= 0x1F) { return false }
  if (c >= 0x7F && c <= 0x9F) { return false }
  // out of range
  if (c > 0x10FFFF) { return false }
  return true
}

function fromCodePoint (c) {
  /* eslint no-bitwise:0 */
  if (c > 0xffff) {
    c -= 0x10000;
    const surrogate1 = 0xd800 + (c >> 10);
    const surrogate2 = 0xdc00 + (c & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2)
  }
  return String.fromCharCode(c)
}

const UNESCAPE_MD_RE  = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const ENTITY_RE       = /&([a-z#][a-z0-9]{1,31});/gi;
const UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + '|' + ENTITY_RE.source, 'gi');

const DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;

function replaceEntityPattern (match, name) {
  if (name.charCodeAt(0) === 0x23/* # */ && DIGITAL_ENTITY_TEST_RE.test(name)) {
    const code = name[1].toLowerCase() === 'x'
      ? parseInt(name.slice(2), 16)
      : parseInt(name.slice(1), 10);

    if (isValidEntityCode(code)) {
      return fromCodePoint(code)
    }

    return match
  }

  const decoded = decodeHTML(match);
  if (decoded !== match) {
    return decoded
  }

  return match
}

/* function replaceEntities(str) {
  if (str.indexOf('&') < 0) { return str; }

  return str.replace(ENTITY_RE, replaceEntityPattern);
} */

function unescapeMd (str) {
  if (str.indexOf('\\') < 0) { return str }
  return str.replace(UNESCAPE_MD_RE, '$1')
}

function unescapeAll (str) {
  if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) { return str }

  return str.replace(UNESCAPE_ALL_RE, function (match, escaped, entity) {
    if (escaped) { return escaped }
    return replaceEntityPattern(match, entity)
  })
}

const HTML_ESCAPE_TEST_RE = /[&<>"]/;
const HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
const HTML_REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
};

function replaceUnsafeChar (ch) {
  return HTML_REPLACEMENTS[ch]
}

function escapeHtml (str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar)
  }
  return str
}

const REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;

function escapeRE$1 (str) {
  return str.replace(REGEXP_ESCAPE_RE, '\\$&')
}

function isSpace (code) {
  switch (code) {
    case 0x09:
    case 0x20:
      return true
  }
  return false
}

// Zs (unicode class) || [\t\f\v\r\n]
function isWhiteSpace (code) {
  if (code >= 0x2000 && code <= 0x200A) { return true }
  switch (code) {
    case 0x09: // \t
    case 0x0A: // \n
    case 0x0B: // \v
    case 0x0C: // \f
    case 0x0D: // \r
    case 0x20:
    case 0xA0:
    case 0x1680:
    case 0x202F:
    case 0x205F:
    case 0x3000:
      return true
  }
  return false
}

/* eslint-disable max-len */

// Currently without astral characters support.
function isPunctChar (ch) {
  return P.test(ch) || regex.test(ch)
}

function isPunctCharCode (code) {
  return isPunctChar(fromCodePoint(code))
}

// Markdown ASCII punctuation characters.
//
// !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
// http://spec.commonmark.org/0.15/#ascii-punctuation-character
//
// Don't confuse with unicode punctuation !!! It lacks some chars in ascii range.
//
function isMdAsciiPunct (ch) {
  switch (ch) {
    case 0x21/* ! */:
    case 0x22/* " */:
    case 0x23/* # */:
    case 0x24/* $ */:
    case 0x25/* % */:
    case 0x26/* & */:
    case 0x27/* ' */:
    case 0x28/* ( */:
    case 0x29/* ) */:
    case 0x2A/* * */:
    case 0x2B/* + */:
    case 0x2C/* , */:
    case 0x2D/* - */:
    case 0x2E/* . */:
    case 0x2F/* / */:
    case 0x3A/* : */:
    case 0x3B/* ; */:
    case 0x3C/* < */:
    case 0x3D/* = */:
    case 0x3E/* > */:
    case 0x3F/* ? */:
    case 0x40/* @ */:
    case 0x5B/* [ */:
    case 0x5C/* \ */:
    case 0x5D/* ] */:
    case 0x5E/* ^ */:
    case 0x5F/* _ */:
    case 0x60/* ` */:
    case 0x7B/* { */:
    case 0x7C/* | */:
    case 0x7D/* } */:
    case 0x7E/* ~ */:
      return true
    default:
      return false
  }
}

// Hepler to unify [reference labels].
//
function normalizeReference (str) {
  // Trim and collapse whitespace
  //
  str = str.trim().replace(/\s+/g, ' ');

  // In node v10 'ẞ'.toLowerCase() === 'Ṿ', which is presumed to be a bug
  // fixed in v12 (couldn't find any details).
  //
  // So treat this one as a special case
  // (remove this when node v10 is no longer supported).
  //
  if ('ẞ'.toLowerCase() === 'Ṿ') {
    /* c8 ignore next 2 */
    str = str.replace(/ẞ/g, 'ß');
  }

  // .toLowerCase().toUpperCase() should get rid of all differences
  // between letter variants.
  //
  // Simple .toLowerCase() doesn't normalize 125 code points correctly,
  // and .toUpperCase doesn't normalize 6 of them (list of exceptions:
  // İ, ϴ, ẞ, Ω, K, Å - those are already uppercased, but have differently
  // uppercased versions).
  //
  // Here's an example showing how it happens. Lets take greek letter omega:
  // uppercase U+0398 (Θ), U+03f4 (ϴ) and lowercase U+03b8 (θ), U+03d1 (ϑ)
  //
  // Unicode entries:
  // 0398;GREEK CAPITAL LETTER THETA;Lu;0;L;;;;;N;;;;03B8;
  // 03B8;GREEK SMALL LETTER THETA;Ll;0;L;;;;;N;;;0398;;0398
  // 03D1;GREEK THETA SYMBOL;Ll;0;L;<compat> 03B8;;;;N;GREEK SMALL LETTER SCRIPT THETA;;0398;;0398
  // 03F4;GREEK CAPITAL THETA SYMBOL;Lu;0;L;<compat> 0398;;;;N;;;;03B8;
  //
  // Case-insensitive comparison should treat all of them as equivalent.
  //
  // But .toLowerCase() doesn't change ϑ (it's already lowercase),
  // and .toUpperCase() doesn't change ϴ (already uppercase).
  //
  // Applying first lower then upper case normalizes any character:
  // '\u0398\u03f4\u03b8\u03d1'.toLowerCase().toUpperCase() === '\u0398\u0398\u0398\u0398'
  //
  // Note: this is equivalent to unicode case folding; unicode normalization
  // is a different step that is not required here.
  //
  // Final result should be uppercased, because it's later stored in an object
  // (this avoid a conflict with Object.prototype members,
  // most notably, `__proto__`)
  //
  return str.toLowerCase().toUpperCase()
}

function isAsciiTrimmable (c) {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d
}

// "Light" .trim() for blocks (headers, paragraphs), where unicode spaces
// should be preserved.
function asciiTrim (str) {
  let start = 0;
  for (; start < str.length; start++) {
    if (!isAsciiTrimmable(str.charCodeAt(start))) {
      break
    }
  }
  let end = str.length - 1;
  for (; end >= start; end--) {
    if (!isAsciiTrimmable(str.charCodeAt(end))) {
      break
    }
  }
  return str.slice(start, end + 1)
}

// Re-export libraries commonly used in both markdown-it and its plugins,
// so plugins won't have to depend on them explicitly, which reduces their
// bundled size (e.g. a browser build).
//
const lib = { mdurl, ucmicro };

var utils = /*#__PURE__*/Object.freeze({
  __proto__: null,
  arrayReplaceAt: arrayReplaceAt,
  asciiTrim: asciiTrim,
  assign: assign$1,
  escapeHtml: escapeHtml,
  escapeRE: escapeRE$1,
  fromCodePoint: fromCodePoint,
  has: has,
  isMdAsciiPunct: isMdAsciiPunct,
  isPunctChar: isPunctChar,
  isPunctCharCode: isPunctCharCode,
  isSpace: isSpace,
  isString: isString$1,
  isValidEntityCode: isValidEntityCode,
  isWhiteSpace: isWhiteSpace,
  lib: lib,
  normalizeReference: normalizeReference,
  unescapeAll: unescapeAll,
  unescapeMd: unescapeMd
});

// Parse link label
//
// this function assumes that first character ("[") already matches;
// returns the end of the label
//

function parseLinkLabel (state, start, disableNested) {
  let level, found, marker, prevPos;

  const max = state.posMax;
  const oldPos = state.pos;

  state.pos = start + 1;
  level = 1;

  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 0x5D /* ] */) {
      level--;
      if (level === 0) {
        found = true;
        break
      }
    }

    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 0x5B /* [ */) {
      if (prevPos === state.pos - 1) {
        // increase level if we find text `[`, which is not a part of any token
        level++;
      } else if (disableNested) {
        state.pos = oldPos;
        return -1
      }
    }
  }

  let labelEnd = -1;

  if (found) {
    labelEnd = state.pos;
  }

  // restore old state
  state.pos = oldPos;

  return labelEnd
}

// Parse link destination
//


function parseLinkDestination (str, start, max) {
  let code;
  let pos = start;

  const result = {
    ok: false,
    pos: 0,
    str: ''
  };

  if (str.charCodeAt(pos) === 0x3C /* < */) {
    pos++;
    while (pos < max) {
      code = str.charCodeAt(pos);
      if (code === 0x0A /* \n */) { return result }
      if (code === 0x3C /* < */) { return result }
      if (code === 0x3E /* > */) {
        result.pos = pos + 1;
        result.str = unescapeAll(str.slice(start + 1, pos));
        result.ok = true;
        return result
      }
      if (code === 0x5C /* \ */ && pos + 1 < max) {
        pos += 2;
        continue
      }

      pos++;
    }

    // no closing '>'
    return result
  }

  // this should be ... } else { ... branch

  let level = 0;
  while (pos < max) {
    code = str.charCodeAt(pos);

    if (code === 0x20) { break }

    // ascii control characters
    if (code < 0x20 || code === 0x7F) { break }

    if (code === 0x5C /* \ */ && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 0x20) { break }
      pos += 2;
      continue
    }

    if (code === 0x28 /* ( */) {
      level++;
      if (level > 32) { return result }
    }

    if (code === 0x29 /* ) */) {
      if (level === 0) { break }
      level--;
    }

    pos++;
  }

  if (start === pos) { return result }
  if (level !== 0) { return result }

  result.str = unescapeAll(str.slice(start, pos));
  result.pos = pos;
  result.ok = true;
  return result
}

// Parse link title
//


// Parse link title within `str` in [start, max] range,
// or continue previous parsing if `prev_state` is defined (equal to result of last execution).
//
function parseLinkTitle (str, start, max, prev_state) {
  let code;
  let pos = start;

  const state = {
    // if `true`, this is a valid link title
    ok: false,
    // if `true`, this link can be continued on the next line
    can_continue: false,
    // if `ok`, it's the position of the first character after the closing marker
    pos: 0,
    // if `ok`, it's the unescaped title
    str: '',
    // expected closing marker character code
    marker: 0
  };

  if (prev_state) {
    // this is a continuation of a previous parseLinkTitle call on the next line,
    // used in reference links only
    state.str = prev_state.str;
    state.marker = prev_state.marker;
  } else {
    if (pos >= max) { return state }

    let marker = str.charCodeAt(pos);
    if (marker !== 0x22 /* " */ && marker !== 0x27 /* ' */ && marker !== 0x28 /* ( */) { return state }

    start++;
    pos++;

    // if opening marker is "(", switch it to closing marker ")"
    if (marker === 0x28) { marker = 0x29; }

    state.marker = marker;
  }

  while (pos < max) {
    code = str.charCodeAt(pos);
    if (code === state.marker) {
      state.pos = pos + 1;
      state.str += unescapeAll(str.slice(start, pos));
      state.ok = true;
      return state
    } else if (code === 0x28 /* ( */ && state.marker === 0x29 /* ) */) {
      return state
    } else if (code === 0x5C /* \ */ && pos + 1 < max) {
      pos++;
    }

    pos++;
  }

  // no closing marker found, but this link title may continue on the next line (for references)
  state.can_continue = true;
  state.str += unescapeAll(str.slice(start, pos));
  return state
}

// Just a shortcut for bulk export

var helpers = /*#__PURE__*/Object.freeze({
  __proto__: null,
  parseLinkDestination: parseLinkDestination,
  parseLinkLabel: parseLinkLabel,
  parseLinkTitle: parseLinkTitle
});

/**
 * class Renderer
 *
 * Generates HTML from parsed token stream. Each instance has independent
 * copy of rules. Those can be rewritten with ease. Also, you can add new
 * rules if you create plugin and adds new token types.
 **/


const default_rules = {};

default_rules.code_inline = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];

  return  '<code' + slf.renderAttrs(token) + '>' +
          escapeHtml(token.content) +
          '</code>'
};

default_rules.code_block = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];

  return  '<pre' + slf.renderAttrs(token) + '><code>' +
          escapeHtml(tokens[idx].content) +
          '</code></pre>\n'
};

default_rules.fence = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? unescapeAll(token.info).trim() : '';
  let langName = '';
  let langAttrs = '';

  if (info) {
    const arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join('');
  }

  let highlighted;
  if (options.highlight) {
    highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
  } else {
    highlighted = escapeHtml(token.content);
  }

  if (highlighted.indexOf('<pre') === 0) {
    return highlighted + '\n'
  }

  // If language exists, inject class gently, without modifying original token.
  // May be, one day we will add .deepClone() for token and simplify this part, but
  // now we prefer to keep things local.
  if (info) {
    const i = token.attrIndex('class');
    const tmpAttrs = token.attrs ? token.attrs.slice() : [];

    if (i < 0) {
      tmpAttrs.push(['class', options.langPrefix + langName]);
    } else {
      tmpAttrs[i] = tmpAttrs[i].slice();
      tmpAttrs[i][1] += ' ' + options.langPrefix + langName;
    }

    // Fake token just to render attributes
    const tmpToken = {
      attrs: tmpAttrs
    };

    return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>\n`
  }

  return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>\n`
};

default_rules.image = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];

  // "alt" attr MUST be set, even if empty. Because it's mandatory and
  // should be placed on proper position for tests.
  //
  // Replace content with actual value

  token.attrs[token.attrIndex('alt')][1] =
    slf.renderInlineAsText(token.children, options, env);

  return slf.renderToken(tokens, idx, options)
};

default_rules.hardbreak = function (tokens, idx, options /*, env */) {
  return options.xhtmlOut ? '<br />\n' : '<br>\n'
};
default_rules.softbreak = function (tokens, idx, options /*, env */) {
  return options.breaks ? (options.xhtmlOut ? '<br />\n' : '<br>\n') : '\n'
};

default_rules.text = function (tokens, idx /*, options, env */) {
  return escapeHtml(tokens[idx].content)
};

default_rules.html_block = function (tokens, idx /*, options, env */) {
  return tokens[idx].content
};
default_rules.html_inline = function (tokens, idx /*, options, env */) {
  return tokens[idx].content
};

/**
 * new Renderer()
 *
 * Creates new [[Renderer]] instance and fill [[Renderer#rules]] with defaults.
 **/
function Renderer () {
  /**
   * Renderer#rules -> Object
   *
   * Contains render rules for tokens. Can be updated and extended.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.renderer.rules.strong_open  = function () { return '<b>'; };
   * md.renderer.rules.strong_close = function () { return '</b>'; };
   *
   * var result = md.renderInline(...);
   * ```
   *
   * Each rule is called as independent static function with fixed signature:
   *
   * ```javascript
   * function my_token_render(tokens, idx, options, env, renderer) {
   *   // ...
   *   return renderedHTML;
   * }
   * ```
   *
   * See [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.mjs)
   * for more details and examples.
   **/
  this.rules = assign$1({}, default_rules);
}

/**
 * Renderer.renderAttrs(token) -> String
 *
 * Render token attributes to string.
 **/
Renderer.prototype.renderAttrs = function renderAttrs (token) {
  let i, l, result;

  if (!token.attrs) { return '' }

  result = '';

  for (i = 0, l = token.attrs.length; i < l; i++) {
    result += ' ' + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
  }

  return result
};

/**
 * Renderer.renderToken(tokens, idx, options) -> String
 * - tokens (Array): list of tokens
 * - idx (Numbed): token index to render
 * - options (Object): params of parser instance
 *
 * Default token renderer. Can be overriden by custom function
 * in [[Renderer#rules]].
 **/
Renderer.prototype.renderToken = function renderToken (tokens, idx, options) {
  const token = tokens[idx];
  let result = '';

  // Tight list paragraphs
  if (token.hidden) {
    return ''
  }

  // Insert a newline between hidden paragraph and subsequent opening
  // block-level tag.
  //
  // For example, here we should insert a newline before blockquote:
  //  - a
  //    >
  //
  if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
    result += '\n';
  }

  // Add token name, e.g. `<img`
  result += (token.nesting === -1 ? '</' : '<') + token.tag;

  // Encode attributes, e.g. `<img src="foo"`
  result += this.renderAttrs(token);

  // Add a slash for self-closing tags, e.g. `<img src="foo" /`
  if (token.nesting === 0 && options.xhtmlOut) {
    result += ' /';
  }

  // Check if we need to add a newline after this tag
  let needLf = false;
  if (token.block) {
    needLf = true;

    if (token.nesting === 1) {
      if (idx + 1 < tokens.length) {
        const nextToken = tokens[idx + 1];

        if (nextToken.type === 'inline' || nextToken.hidden) {
          // Block-level tag containing an inline tag.
          //
          needLf = false;
        } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
          // Opening tag + closing tag of the same type. E.g. `<li></li>`.
          //
          needLf = false;
        }
      }
    }
  }

  result += needLf ? '>\n' : '>';

  return result
};

/**
 * Renderer.renderInline(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * The same as [[Renderer.render]], but for single token of `inline` type.
 **/
Renderer.prototype.renderInline = function (tokens, options, env) {
  let result = '';
  const rules = this.rules;

  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;

    if (typeof rules[type] !== 'undefined') {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options);
    }
  }

  return result
};

/** internal
 * Renderer.renderInlineAsText(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * Special kludge for image `alt` attributes to conform CommonMark spec.
 * Don't try to use it! Spec requires to show `alt` content with stripped markup,
 * instead of simple escaping.
 **/
Renderer.prototype.renderInlineAsText = function (tokens, options, env) {
  let result = '';

  for (let i = 0, len = tokens.length; i < len; i++) {
    switch (tokens[i].type) {
      case 'text':
        result += tokens[i].content;
        break
      case 'image':
        result += this.renderInlineAsText(tokens[i].children, options, env);
        break
      case 'html_inline':
      case 'html_block':
        result += tokens[i].content;
        break
      case 'softbreak':
      case 'hardbreak':
        result += '\n';
        break
        // all other tokens are skipped
    }
  }

  return result
};

/**
 * Renderer.render(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * Takes token stream and generates HTML. Probably, you will never need to call
 * this method directly.
 **/
Renderer.prototype.render = function (tokens, options, env) {
  let result = '';
  const rules = this.rules;

  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;

    if (type === 'inline') {
      result += this.renderInline(tokens[i].children, options, env);
    } else if (typeof rules[type] !== 'undefined') {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options, env);
    }
  }

  return result
};

/**
 * class Ruler
 *
 * Helper class, used by [[MarkdownIt#core]], [[MarkdownIt#block]] and
 * [[MarkdownIt#inline]] to manage sequences of functions (rules):
 *
 * - keep rules in defined order
 * - assign the name to each rule
 * - enable/disable rules
 * - add/replace rules
 * - allow assign rules to additional named chains (in the same)
 * - cacheing lists of active rules
 *
 * You will not need use this class directly until write plugins. For simple
 * rules control use [[MarkdownIt.disable]], [[MarkdownIt.enable]] and
 * [[MarkdownIt.use]].
 **/

/**
 * new Ruler()
 **/
function Ruler () {
  // List of added rules. Each element is:
  //
  // {
  //   name: XXX,
  //   enabled: Boolean,
  //   fn: Function(),
  //   alt: [ name2, name3 ]
  // }
  //
  this.__rules__ = [];

  // Cached rule chains.
  //
  // First level - chain name, '' for default.
  // Second level - diginal anchor for fast filtering by charcodes.
  //
  this.__cache__ = null;
}

// Helper methods, should not be used directly

// Find rule index by name
//
Ruler.prototype.__find__ = function (name) {
  for (let i = 0; i < this.__rules__.length; i++) {
    if (this.__rules__[i].name === name) {
      return i
    }
  }
  return -1
};

// Build rules lookup cache
//
Ruler.prototype.__compile__ = function () {
  const self = this;
  const chains = [''];

  // collect unique names
  self.__rules__.forEach(function (rule) {
    if (!rule.enabled) { return }

    rule.alt.forEach(function (altName) {
      if (chains.indexOf(altName) < 0) {
        chains.push(altName);
      }
    });
  });

  self.__cache__ = {};

  chains.forEach(function (chain) {
    self.__cache__[chain] = [];
    self.__rules__.forEach(function (rule) {
      if (!rule.enabled) { return }

      if (chain && rule.alt.indexOf(chain) < 0) { return }

      self.__cache__[chain].push(rule.fn);
    });
  });
};

/**
 * Ruler.at(name, fn [, options])
 * - name (String): rule name to replace.
 * - fn (Function): new rule function.
 * - options (Object): new rule options (not mandatory).
 *
 * Replace rule by name with new function & options. Throws error if name not
 * found.
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * Replace existing typographer replacement rule with new one:
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.core.ruler.at('replacements', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.at = function (name, fn, options) {
  const index = this.__find__(name);
  const opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + name) }

  this.__rules__[index].fn = fn;
  this.__rules__[index].alt = opt.alt || [];
  this.__cache__ = null;
};

/**
 * Ruler.before(beforeName, ruleName, fn [, options])
 * - beforeName (String): new rule will be added before this one.
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Add new rule to chain before one with given name. See also
 * [[Ruler.after]], [[Ruler.push]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
  const index = this.__find__(beforeName);
  const opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + beforeName) }

  this.__rules__.splice(index, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};

/**
 * Ruler.after(afterName, ruleName, fn [, options])
 * - afterName (String): new rule will be added after this one.
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Add new rule to chain after one with given name. See also
 * [[Ruler.before]], [[Ruler.push]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.inline.ruler.after('text', 'my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.after = function (afterName, ruleName, fn, options) {
  const index = this.__find__(afterName);
  const opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + afterName) }

  this.__rules__.splice(index + 1, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};

/**
 * Ruler.push(ruleName, fn [, options])
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Push new rule to the end of chain. See also
 * [[Ruler.before]], [[Ruler.after]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.core.ruler.push('my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.push = function (ruleName, fn, options) {
  const opt = options || {};

  this.__rules__.push({
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};

/**
 * Ruler.enable(list [, ignoreInvalid]) -> Array
 * - list (String|Array): list of rule names to enable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable rules with given names. If any rule name not found - throw Error.
 * Errors can be disabled by second param.
 *
 * Returns list of found rule names (if no exception happened).
 *
 * See also [[Ruler.disable]], [[Ruler.enableOnly]].
 **/
Ruler.prototype.enable = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [list]; }

  const result = [];

  // Search by name and enable
  list.forEach(function (name) {
    const idx = this.__find__(name);

    if (idx < 0) {
      if (ignoreInvalid) { return }
      throw new Error('Rules manager: invalid rule name ' + name)
    }
    this.__rules__[idx].enabled = true;
    result.push(name);
  }, this);

  this.__cache__ = null;
  return result
};

/**
 * Ruler.enableOnly(list [, ignoreInvalid])
 * - list (String|Array): list of rule names to enable (whitelist).
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable rules with given names, and disable everything else. If any rule name
 * not found - throw Error. Errors can be disabled by second param.
 *
 * See also [[Ruler.disable]], [[Ruler.enable]].
 **/
Ruler.prototype.enableOnly = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [list]; }

  this.__rules__.forEach(function (rule) { rule.enabled = false; });

  this.enable(list, ignoreInvalid);
};

/**
 * Ruler.disable(list [, ignoreInvalid]) -> Array
 * - list (String|Array): list of rule names to disable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Disable rules with given names. If any rule name not found - throw Error.
 * Errors can be disabled by second param.
 *
 * Returns list of found rule names (if no exception happened).
 *
 * See also [[Ruler.enable]], [[Ruler.enableOnly]].
 **/
Ruler.prototype.disable = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [list]; }

  const result = [];

  // Search by name and disable
  list.forEach(function (name) {
    const idx = this.__find__(name);

    if (idx < 0) {
      if (ignoreInvalid) { return }
      throw new Error('Rules manager: invalid rule name ' + name)
    }
    this.__rules__[idx].enabled = false;
    result.push(name);
  }, this);

  this.__cache__ = null;
  return result
};

/**
 * Ruler.getRules(chainName) -> Array
 *
 * Return array of active functions (rules) for given chain name. It analyzes
 * rules configuration, compiles caches if not exists and returns result.
 *
 * Default chain name is `''` (empty string). It can't be skipped. That's
 * done intentionally, to keep signature monomorphic for high speed.
 **/
Ruler.prototype.getRules = function (chainName) {
  if (this.__cache__ === null) {
    this.__compile__();
  }

  // Chain can be empty, if rules disabled. But we still have to return Array.
  return this.__cache__[chainName] || []
};

// Token class

/**
 * class Token
 **/

/**
 * new Token(type, tag, nesting)
 *
 * Create new token and fill passed properties.
 **/
function Token (type, tag, nesting) {
  /**
   * Token#type -> String
   *
   * Type of the token (string, e.g. "paragraph_open")
   **/
  this.type     = type;

  /**
   * Token#tag -> String
   *
   * html tag name, e.g. "p"
   **/
  this.tag      = tag;

  /**
   * Token#attrs -> Array
   *
   * Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
   **/
  this.attrs    = null;

  /**
   * Token#map -> Array
   *
   * Source map info. Format: `[ line_begin, line_end ]`
   **/
  this.map      = null;

  /**
   * Token#nesting -> Number
   *
   * Level change (number in {-1, 0, 1} set), where:
   *
   * -  `1` means the tag is opening
   * -  `0` means the tag is self-closing
   * - `-1` means the tag is closing
   **/
  this.nesting  = nesting;

  /**
   * Token#level -> Number
   *
   * nesting level, the same as `state.level`
   **/
  this.level    = 0;

  /**
   * Token#children -> Array
   *
   * An array of child nodes (inline and img tokens)
   **/
  this.children = null;

  /**
   * Token#content -> String
   *
   * In a case of self-closing tag (code, html, fence, etc.),
   * it has contents of this tag.
   **/
  this.content  = '';

  /**
   * Token#markup -> String
   *
   * '*' or '_' for emphasis, fence string for fence, etc.
   **/
  this.markup   = '';

  /**
   * Token#info -> String
   *
   * Additional information:
   *
   * - Info string for "fence" tokens
   * - The value "auto" for autolink "link_open" and "link_close" tokens
   * - The string value of the item marker for ordered-list "list_item_open" tokens
   **/
  this.info     = '';

  /**
   * Token#meta -> Object
   *
   * A place for plugins to store an arbitrary data
   **/
  this.meta     = null;

  /**
   * Token#block -> Boolean
   *
   * True for block-level tokens, false for inline tokens.
   * Used in renderer to calculate line breaks
   **/
  this.block    = false;

  /**
   * Token#hidden -> Boolean
   *
   * If it's true, ignore this element when rendering. Used for tight lists
   * to hide paragraphs.
   **/
  this.hidden   = false;
}

/**
 * Token.attrIndex(name) -> Number
 *
 * Search attribute index by name.
 **/
Token.prototype.attrIndex = function attrIndex (name) {
  if (!this.attrs) { return -1 }

  const attrs = this.attrs;

  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i][0] === name) { return i }
  }
  return -1
};

/**
 * Token.attrPush(attrData)
 *
 * Add `[ name, value ]` attribute to list. Init attrs if necessary
 **/
Token.prototype.attrPush = function attrPush (attrData) {
  if (this.attrs) {
    this.attrs.push(attrData);
  } else {
    this.attrs = [attrData];
  }
};

/**
 * Token.attrSet(name, value)
 *
 * Set `name` attribute to `value`. Override old value if exists.
 **/
Token.prototype.attrSet = function attrSet (name, value) {
  const idx = this.attrIndex(name);
  const attrData = [name, value];

  if (idx < 0) {
    this.attrPush(attrData);
  } else {
    this.attrs[idx] = attrData;
  }
};

/**
 * Token.attrGet(name)
 *
 * Get the value of attribute `name`, or null if it does not exist.
 **/
Token.prototype.attrGet = function attrGet (name) {
  const idx = this.attrIndex(name);
  let value = null;
  if (idx >= 0) {
    value = this.attrs[idx][1];
  }
  return value
};

/**
 * Token.attrJoin(name, value)
 *
 * Join value to existing attribute via space. Or create new attribute if not
 * exists. Useful to operate with token classes.
 **/
Token.prototype.attrJoin = function attrJoin (name, value) {
  const idx = this.attrIndex(name);

  if (idx < 0) {
    this.attrPush([name, value]);
  } else {
    this.attrs[idx][1] = this.attrs[idx][1] + ' ' + value;
  }
};

// Core state object
//


function StateCore (src, md, env) {
  this.src = src;
  this.env = env;
  this.tokens = [];
  this.inlineMode = false;
  this.md = md; // link to parser instance
}

// re-export Token class to use in core rules
StateCore.prototype.Token = Token;

// Normalize input string

// https://spec.commonmark.org/0.29/#line-ending
const NEWLINES_RE  = /\r\n?|\n/g;
const NULL_RE      = /\0/g;

function normalize$1 (state) {
  let str;

  // Normalize newlines
  str = state.src.replace(NEWLINES_RE, '\n');

  // Replace NULL characters
  str = str.replace(NULL_RE, '\uFFFD');

  state.src = str;
}

function block (state) {
  let token;

  if (state.inlineMode) {
    token          = new state.Token('inline', '', 0);
    token.content  = state.src;
    token.map      = [0, 1];
    token.children = [];
    state.tokens.push(token);
  } else {
    state.md.block.parse(state.src, state.md, state.env, state.tokens);
  }
}

function inline (state) {
  const tokens = state.tokens;

  // Parse inlines
  for (let i = 0, l = tokens.length; i < l; i++) {
    const tok = tokens[i];
    if (tok.type === 'inline') {
      state.md.inline.parse(tok.content, state.md, state.env, tok.children);
    }
  }
}

// Replace link-like texts with link nodes.
//
// Currently restricted by `md.validateLink()` to http/https/ftp
//


function isLinkOpen$1 (str) {
  return /^<a[>\s]/i.test(str)
}
function isLinkClose$1 (str) {
  return /^<\/a\s*>/i.test(str)
}

function linkify$1 (state) {
  const blockTokens = state.tokens;

  if (!state.md.options.linkify) { return }

  for (let j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== 'inline' ||
        !state.md.linkify.pretest(blockTokens[j].content)) {
      continue
    }

    let tokens = blockTokens[j].children;

    let htmlLinkLevel = 0;

    // We scan from the end, to keep position when new tags added.
    // Use reversed logic in links start/end match
    for (let i = tokens.length - 1; i >= 0; i--) {
      const currentToken = tokens[i];

      // Skip content of markdown links
      if (currentToken.type === 'link_close') {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== 'link_open') {
          i--;
        }
        continue
      }

      // Skip content of html tag links
      if (currentToken.type === 'html_inline') {
        if (isLinkOpen$1(currentToken.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (isLinkClose$1(currentToken.content)) {
          htmlLinkLevel++;
        }
      }
      if (htmlLinkLevel > 0) { continue }

      if (currentToken.type === 'text' && state.md.linkify.test(currentToken.content)) {
        const text = currentToken.content;
        let links = state.md.linkify.match(text);

        // Now split string to nodes
        const nodes = [];
        let level = currentToken.level;
        let lastPos = 0;

        // forbid escape sequence at the start of the string,
        // this avoids http\://example.com/ from being linkified as
        // http:<a href="//example.com/">//example.com/</a>
        if (links.length > 0 &&
            links[0].index === 0 &&
            i > 0 &&
            tokens[i - 1].type === 'text_special') {
          links = links.slice(1);
        }

        for (let ln = 0; ln < links.length; ln++) {
          const url = links[ln].url;
          const fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) { continue }

          let urlText = links[ln].text;

          // Linkifier might send raw hostnames like "example.com", where url
          // starts with domain name. So we prepend http:// in those cases,
          // and remove it afterwards.
          //
          if (!links[ln].schema) {
            urlText = state.md.normalizeLinkText('http://' + urlText).replace(/^http:\/\//, '');
          } else if (links[ln].schema === 'mailto:' && !/^mailto:/i.test(urlText)) {
            urlText = state.md.normalizeLinkText('mailto:' + urlText).replace(/^mailto:/, '');
          } else {
            urlText = state.md.normalizeLinkText(urlText);
          }

          const pos = links[ln].index;

          if (pos > lastPos) {
            const token   = new state.Token('text', '', 0);
            token.content = text.slice(lastPos, pos);
            token.level   = level;
            nodes.push(token);
          }

          const token_o   = new state.Token('link_open', 'a', 1);
          token_o.attrs   = [['href', fullUrl]];
          token_o.level   = level++;
          token_o.markup  = 'linkify';
          token_o.info    = 'auto';
          nodes.push(token_o);

          const token_t   = new state.Token('text', '', 0);
          token_t.content = urlText;
          token_t.level   = level;
          nodes.push(token_t);

          const token_c   = new state.Token('link_close', 'a', -1);
          token_c.level   = --level;
          token_c.markup  = 'linkify';
          token_c.info    = 'auto';
          nodes.push(token_c);

          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text.length) {
          const token   = new state.Token('text', '', 0);
          token.content = text.slice(lastPos);
          token.level   = level;
          nodes.push(token);
        }

        // replace current node
        blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
      }
    }
  }
}

// Simple typographic replacements
//
// (c) (C) → ©
// (tm) (TM) → ™
// (r) (R) → ®
// +- → ±
// ... → … (also ?.... → ?.., !.... → !..)
// ???????? → ???, !!!!! → !!!, `,,` → `,`
// -- → &ndash;, --- → &mdash;
//

// TODO:
// - fractionals 1/2, 1/4, 3/4 -> ½, ¼, ¾
// - multiplications 2 x 4 -> 2 × 4

const RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;

// Workaround for phantomjs - need regex without /g flag,
// or root check will fail every second time
const SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;

const SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
const SCOPED_ABBR = {
  c: '©',
  r: '®',
  tm: '™'
};

function replaceFn (match, name) {
  return SCOPED_ABBR[name.toLowerCase()]
}

function replace_scoped (inlineTokens) {
  let inside_autolink = 0;

  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];

    if (token.type === 'text' && !inside_autolink) {
      token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    }

    if (token.type === 'link_open' && token.info === 'auto') {
      inside_autolink--;
    }

    if (token.type === 'link_close' && token.info === 'auto') {
      inside_autolink++;
    }
  }
}

function replace_rare (inlineTokens) {
  let inside_autolink = 0;

  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];

    if (token.type === 'text' && !inside_autolink) {
      if (RARE_RE.test(token.content)) {
        token.content = token.content
          .replace(/\+-/g, '±')
          // .., ..., ....... -> …
          // but ?..... & !..... -> ?.. & !..
          .replace(/\.{2,}/g, '…').replace(/([?!])…/g, '$1..')
          .replace(/([?!]){4,}/g, '$1$1$1').replace(/,{2,}/g, ',')
          // em-dash
          .replace(/(^|[^-])---(?=[^-]|$)/mg, '$1\u2014')
          // en-dash
          .replace(/(^|\s)--(?=\s|$)/mg, '$1\u2013')
          .replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, '$1\u2013');
      }
    }

    if (token.type === 'link_open' && token.info === 'auto') {
      inside_autolink--;
    }

    if (token.type === 'link_close' && token.info === 'auto') {
      inside_autolink++;
    }
  }
}

function replace$1 (state) {
  let blkIdx;

  if (!state.md.options.typographer) { return }

  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== 'inline') { continue }

    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
      replace_scoped(state.tokens[blkIdx].children);
    }

    if (RARE_RE.test(state.tokens[blkIdx].content)) {
      replace_rare(state.tokens[blkIdx].children);
    }
  }
}

// Convert straight quotation marks to typographic ones
//


const QUOTE_TEST_RE = /['"]/;
const QUOTE_RE = /['"]/g;
const APOSTROPHE = '\u2019'; /* ’ */

function addReplacement (replacements, tokenIdx, pos, ch) {
  if (!replacements[tokenIdx]) {
    replacements[tokenIdx] = [];
  }

  replacements[tokenIdx].push({ pos, ch });
}

function applyReplacements (str, replacements) {
  let result = '';
  let lastPos = 0;

  replacements.sort((a, b) => a.pos - b.pos);

  for (let i = 0; i < replacements.length; i++) {
    const replacement = replacements[i];

    result += str.slice(lastPos, replacement.pos) + replacement.ch;
    lastPos = replacement.pos + 1;
  }

  return result + str.slice(lastPos)
}

function process_inlines (tokens, state) {
  let j;

  const stack = [];
  // token index -> list of replacements in the original token content
  const replacements = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const thisLevel = tokens[i].level;

    for (j = stack.length - 1; j >= 0; j--) {
      if (stack[j].level <= thisLevel) { break }
    }
    stack.length = j + 1;

    if (token.type !== 'text') { continue }

    const text = token.content;
    let pos = 0;
    const max = text.length;

    /* eslint no-labels:0,block-scoped-var:0 */
    OUTER:
    while (pos < max) {
      QUOTE_RE.lastIndex = pos;
      const t = QUOTE_RE.exec(text);
      if (!t) { break }

      let canOpen = true;
      let canClose = true;
      pos = t.index + 1;
      const isSingle = (t[0] === "'");

      // Find previous character,
      // default to space if it's the beginning of the line
      //
      let lastChar = 0x20;

      if (t.index - 1 >= 0) {
        lastChar = text.charCodeAt(t.index - 1);
      } else {
        for (j = i - 1; j >= 0; j--) {
          if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break // lastChar defaults to 0x20
          if (!tokens[j].content) continue // should skip all tokens except 'text', 'html_inline' or 'code_inline'

          lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
          break
        }
      }

      // Find next character,
      // default to space if it's the end of the line
      //
      let nextChar = 0x20;

      if (pos < max) {
        nextChar = text.charCodeAt(pos);
      } else {
        for (j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break // nextChar defaults to 0x20
          if (!tokens[j].content) continue // should skip all tokens except 'text', 'html_inline' or 'code_inline'

          nextChar = tokens[j].content.charCodeAt(0);
          break
        }
      }

      const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
      const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);

      const isLastWhiteSpace = isWhiteSpace(lastChar);
      const isNextWhiteSpace = isWhiteSpace(nextChar);

      if (isNextWhiteSpace) {
        canOpen = false;
      } else if (isNextPunctChar) {
        if (!(isLastWhiteSpace || isLastPunctChar)) {
          canOpen = false;
        }
      }

      if (isLastWhiteSpace) {
        canClose = false;
      } else if (isLastPunctChar) {
        if (!(isNextWhiteSpace || isNextPunctChar)) {
          canClose = false;
        }
      }

      if (nextChar === 0x22 /* " */ && t[0] === '"') {
        if (lastChar >= 0x30 /* 0 */ && lastChar <= 0x39 /* 9 */) {
          // special case: 1"" - count first quote as an inch
          canClose = canOpen = false;
        }
      }

      if (canOpen && canClose) {
        // Replace quotes in the middle of punctuation sequence, but not
        // in the middle of the words, i.e.:
        //
        // 1. foo " bar " baz - not replaced
        // 2. foo-"-bar-"-baz - replaced
        // 3. foo"bar"baz     - not replaced
        //
        canOpen = isLastPunctChar;
        canClose = isNextPunctChar;
      }

      if (!canOpen && !canClose) {
        // middle of word
        if (isSingle) {
          addReplacement(replacements, i, t.index, APOSTROPHE);
        }
        continue
      }

      if (canClose) {
        // this could be a closing quote, rewind the stack to get a match
        for (j = stack.length - 1; j >= 0; j--) {
          let item = stack[j];
          if (stack[j].level < thisLevel) { break }
          if (item.single === isSingle && stack[j].level === thisLevel) {
            item = stack[j];

            let openQuote;
            let closeQuote;
            if (isSingle) {
              openQuote = state.md.options.quotes[2];
              closeQuote = state.md.options.quotes[3];
            } else {
              openQuote = state.md.options.quotes[0];
              closeQuote = state.md.options.quotes[1];
            }

            addReplacement(replacements, i, t.index, closeQuote);
            addReplacement(replacements, item.token, item.pos, openQuote);

            stack.length = j;
            continue OUTER
          }
        }
      }

      if (canOpen) {
        stack.push({
          token: i,
          pos: t.index,
          single: isSingle,
          level: thisLevel
        });
      } else if (canClose && isSingle) {
        addReplacement(replacements, i, t.index, APOSTROPHE);
      }
    }
  }

  Object.keys(replacements).forEach(function (tokenIdx) {
    tokens[tokenIdx].content = applyReplacements(tokens[tokenIdx].content, replacements[tokenIdx]);
  });
}

function smartquotes (state) {
  /* eslint max-depth:0 */
  if (!state.md.options.typographer) { return }

  for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== 'inline' ||
        !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
      continue
    }

    process_inlines(state.tokens[blkIdx].children, state);
  }
}

// Join raw text tokens with the rest of the text
//
// This is set as a separate rule to provide an opportunity for plugins
// to run text replacements after text join, but before escape join.
//
// For example, `\:)` shouldn't be replaced with an emoji.
//

function text_join (state) {
  let curr, last;
  const blockTokens = state.tokens;
  const l = blockTokens.length;

  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== 'inline') continue

    const tokens = blockTokens[j].children;
    const max = tokens.length;

    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === 'text_special') {
        tokens[curr].type = 'text';
      }
    }

    for (curr = last = 0; curr < max; curr++) {
      if (tokens[curr].type === 'text' &&
          curr + 1 < max &&
          tokens[curr + 1].type === 'text') {
        // collapse two adjacent text nodes
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
      } else {
        if (curr !== last) { tokens[last] = tokens[curr]; }

        last++;
      }
    }

    if (curr !== last) {
      tokens.length = last;
    }
  }
}

/** internal
 * class Core
 *
 * Top-level rules executor. Glues block/inline parsers and does intermediate
 * transformations.
 **/


const _rules$2 = [
  ['normalize',      normalize$1],
  ['block',          block],
  ['inline',         inline],
  ['linkify',        linkify$1],
  ['replacements',   replace$1],
  ['smartquotes',    smartquotes],
  // `text_join` finds `text_special` tokens (for escape sequences)
  // and joins them with the rest of the text
  ['text_join',      text_join]
];

/**
 * new Core()
 **/
function Core () {
  /**
   * Core#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of core rules.
   **/
  this.ruler = new Ruler();

  for (let i = 0; i < _rules$2.length; i++) {
    this.ruler.push(_rules$2[i][0], _rules$2[i][1]);
  }
}

/**
 * Core.process(state)
 *
 * Executes core chain rules.
 **/
Core.prototype.process = function (state) {
  const rules = this.ruler.getRules('');

  for (let i = 0, l = rules.length; i < l; i++) {
    rules[i](state);
  }
};

Core.prototype.State = StateCore;

// Parser state class


function StateBlock (src, md, env, tokens) {
  this.src = src;

  // link to parser instance
  this.md     = md;

  this.env = env;

  //
  // Internal state vartiables
  //

  this.tokens = tokens;

  this.bMarks = [];  // line begin offsets for fast jumps
  this.eMarks = [];  // line end offsets for fast jumps
  this.tShift = [];  // offsets of the first non-space characters (tabs not expanded)
  this.sCount = [];  // indents for each line (tabs expanded)

  // An amount of virtual spaces (tabs expanded) between beginning
  // of each line (bMarks) and real beginning of that line.
  //
  // It exists only as a hack because blockquotes override bMarks
  // losing information in the process.
  //
  // It's used only when expanding tabs, you can think about it as
  // an initial tab length, e.g. bsCount=21 applied to string `\t123`
  // means first tab should be expanded to 4-21%4 === 3 spaces.
  //
  this.bsCount = [];

  // block parser variables

  // required block content indent (for example, if we are
  // inside a list, it would be positioned after list marker)
  this.blkIndent  = 0;
  this.line       = 0; // line index in src
  this.lineMax    = 0; // lines count
  this.tight      = false;  // loose/tight mode for lists
  this.ddIndent   = -1; // indent of the current dd block (-1 if there isn't any)
  this.listIndent = -1; // indent of the current list block (-1 if there isn't any)

  // can be 'blockquote', 'list', 'root', 'paragraph' or 'reference'
  // used in lists to determine if they interrupt a paragraph
  this.parentType = 'root';

  this.level = 0;

  // Create caches
  // Generate markers.
  const s = this.src;

  for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
    const ch = s.charCodeAt(pos);

    if (!indent_found) {
      if (isSpace(ch)) {
        indent++;

        if (ch === 0x09) {
          offset += 4 - offset % 4;
        } else {
          offset++;
        }
        continue
      } else {
        indent_found = true;
      }
    }

    if (ch === 0x0A || pos === len - 1) {
      if (ch !== 0x0A) { pos++; }
      this.bMarks.push(start);
      this.eMarks.push(pos);
      this.tShift.push(indent);
      this.sCount.push(offset);
      this.bsCount.push(0);

      indent_found = false;
      indent = 0;
      offset = 0;
      start = pos + 1;
    }
  }

  // Push fake entry to simplify cache bounds checks
  this.bMarks.push(s.length);
  this.eMarks.push(s.length);
  this.tShift.push(0);
  this.sCount.push(0);
  this.bsCount.push(0);

  this.lineMax = this.bMarks.length - 1; // don't count last fake line
}

// Push new token to "stream".
//
StateBlock.prototype.push = function (type, tag, nesting) {
  const token = new Token(type, tag, nesting);
  token.block = true;

  if (nesting < 0) this.level--; // closing tag
  token.level = this.level;
  if (nesting > 0) this.level++; // opening tag

  this.tokens.push(token);
  return token
};

StateBlock.prototype.isEmpty = function isEmpty (line) {
  return this.bMarks[line] + this.tShift[line] >= this.eMarks[line]
};

StateBlock.prototype.skipEmptyLines = function skipEmptyLines (from) {
  for (let max = this.lineMax; from < max; from++) {
    if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
      break
    }
  }
  return from
};

// Skip spaces from given position.
StateBlock.prototype.skipSpaces = function skipSpaces (pos) {
  for (let max = this.src.length; pos < max; pos++) {
    const ch = this.src.charCodeAt(pos);
    if (!isSpace(ch)) { break }
  }
  return pos
};

// Skip spaces from given position in reverse.
StateBlock.prototype.skipSpacesBack = function skipSpacesBack (pos, min) {
  if (pos <= min) { return pos }

  while (pos > min) {
    if (!isSpace(this.src.charCodeAt(--pos))) { return pos + 1 }
  }
  return pos
};

// Skip char codes from given position
StateBlock.prototype.skipChars = function skipChars (pos, code) {
  for (let max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== code) { break }
  }
  return pos
};

// Skip char codes reverse from given position - 1
StateBlock.prototype.skipCharsBack = function skipCharsBack (pos, code, min) {
  if (pos <= min) { return pos }

  while (pos > min) {
    if (code !== this.src.charCodeAt(--pos)) { return pos + 1 }
  }
  return pos
};

// cut lines range from source.
StateBlock.prototype.getLines = function getLines (begin, end, indent, keepLastLF) {
  if (begin >= end) {
    return ''
  }

  const queue = new Array(end - begin);

  for (let i = 0, line = begin; line < end; line++, i++) {
    let lineIndent = 0;
    const lineStart = this.bMarks[line];
    let first = lineStart;
    let last;

    if (line + 1 < end || keepLastLF) {
      // No need for bounds check because we have fake entry on tail.
      last = this.eMarks[line] + 1;
    } else {
      last = this.eMarks[line];
    }

    while (first < last && lineIndent < indent) {
      const ch = this.src.charCodeAt(first);

      if (isSpace(ch)) {
        if (ch === 0x09) {
          lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        } else {
          lineIndent++;
        }
      } else if (first - lineStart < this.tShift[line]) {
        // patched tShift masked characters to look like spaces (blockquotes, list markers)
        lineIndent++;
      } else {
        break
      }

      first++;
    }

    if (lineIndent > indent) {
      // partially expanding tabs in code blocks, e.g '\t\tfoobar'
      // with indent=2 becomes '  \tfoobar'
      queue[i] = new Array(lineIndent - indent + 1).join(' ') + this.src.slice(first, last);
    } else {
      queue[i] = this.src.slice(first, last);
    }
  }

  return queue.join('')
};

// re-export Token class to use in block rules
StateBlock.prototype.Token = Token;

// GFM table, https://github.github.com/gfm/#tables-extension-


// Limit the amount of empty autocompleted cells in a table,
// see https://github.com/markdown-it/markdown-it/issues/1000,
//
// Both pulldown-cmark and commonmark-hs limit the number of cells this way to ~200k.
// We set it to 65k, which can expand user input by a factor of x370
// (256x256 square is 1.8kB expanded into 650kB).
const MAX_AUTOCOMPLETED_CELLS = 0x10000;

function getLine (state, line) {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];

  return state.src.slice(pos, max)
}

function escapedSplit (str) {
  const result = [];
  const max = str.length;

  let pos = 0;
  let ch = str.charCodeAt(pos);
  let isEscaped = false;
  let lastPos = 0;
  let current = '';

  while (pos < max) {
    if (ch === 0x7c/* | */) {
      if (!isEscaped) {
        // pipe separating cells, '|'
        result.push(current + str.substring(lastPos, pos));
        current = '';
        lastPos = pos + 1;
      } else {
        // escaped pipe, '\|'
        current += str.substring(lastPos, pos - 1);
        lastPos = pos;
      }
    }

    isEscaped = (ch === 0x5c/* \ */);
    pos++;

    ch = str.charCodeAt(pos);
  }

  result.push(current + str.substring(lastPos));

  return result
}

function table (state, startLine, endLine, silent) {
  // should have at least two lines
  if (startLine + 2 > endLine) { return false }

  let nextLine = startLine + 1;

  if (state.sCount[nextLine] < state.blkIndent) { return false }

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[nextLine] - state.blkIndent >= 4) { return false }

  // first character of the second line should be '|', '-', ':',
  // and no other characters are allowed but spaces;
  // basically, this is the equivalent of /^[-:|][-:|\s]*$/ regexp

  let pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) { return false }

  const firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 0x7C/* | */ && firstCh !== 0x2D/* - */ && firstCh !== 0x3A/* : */) { return false }

  if (pos >= state.eMarks[nextLine]) { return false }

  const secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 0x7C/* | */ && secondCh !== 0x2D/* - */ && secondCh !== 0x3A/* : */ && !isSpace(secondCh)) {
    return false
  }

  // if first character is '-', then second character must not be a space
  // (due to parsing ambiguity with list)
  if (firstCh === 0x2D/* - */ && isSpace(secondCh)) { return false }

  while (pos < state.eMarks[nextLine]) {
    const ch = state.src.charCodeAt(pos);

    if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */ && !isSpace(ch)) { return false }

    pos++;
  }

  let lineText = getLine(state, startLine + 1);
  let columns = lineText.split('|');
  const aligns = [];
  for (let i = 0; i < columns.length; i++) {
    const t = columns[i].trim();
    if (!t) {
      // allow empty columns before and after table, but not in between columns;
      // e.g. allow ` |---| `, disallow ` ---||--- `
      if (i === 0 || i === columns.length - 1) {
        continue
      } else {
        return false
      }
    }

    if (!/^:?-+:?$/.test(t)) { return false }
    if (t.charCodeAt(t.length - 1) === 0x3A/* : */) {
      aligns.push(t.charCodeAt(0) === 0x3A/* : */ ? 'center' : 'right');
    } else if (t.charCodeAt(0) === 0x3A/* : */) {
      aligns.push('left');
    } else {
      aligns.push('');
    }
  }

  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf('|') === -1) { return false }
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === '') columns.shift();
  if (columns.length && columns[columns.length - 1] === '') columns.pop();

  // header row will define an amount of columns in the entire table,
  // and align row should be exactly the same (the rest of the rows can differ)
  const columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) { return false }

  if (silent) { return true }

  const oldParentType = state.parentType;
  state.parentType = 'table';

  // use 'blockquote' lists for termination because it's
  // the most similar to tables
  const terminatorRules = state.md.block.ruler.getRules('blockquote');

  const token_to = state.push('table_open', 'table', 1);
  const tableLines = [startLine, 0];
  token_to.map = tableLines;

  const token_tho = state.push('thead_open', 'thead', 1);
  token_tho.map = [startLine, startLine + 1];

  const token_htro = state.push('tr_open', 'tr', 1);
  token_htro.map = [startLine, startLine + 1];

  for (let i = 0; i < columns.length; i++) {
    const token_ho = state.push('th_open', 'th', 1);
    if (aligns[i]) {
      token_ho.attrs  = [['style', 'text-align:' + aligns[i]]];
    }

    const token_il = state.push('inline', '', 0);
    token_il.content  = columns[i].trim();
    token_il.children = [];

    state.push('th_close', 'th', -1);
  }

  state.push('tr_close', 'tr', -1);
  state.push('thead_close', 'thead', -1);

  let tbodyLines;
  let autocompletedCells = 0;

  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) { break }

    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break
      }
    }

    if (terminate) { break }
    lineText = getLine(state, nextLine).trim();
    if (!lineText) { break }
    if (state.sCount[nextLine] - state.blkIndent >= 4) { break }
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === '') columns.shift();
    if (columns.length && columns[columns.length - 1] === '') columns.pop();

    // note: autocomplete count can be negative if user specifies more columns than header,
    // but that does not affect intended use (which is limiting expansion)
    autocompletedCells += columnCount - columns.length;
    if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) { break }

    if (nextLine === startLine + 2) {
      const token_tbo = state.push('tbody_open', 'tbody', 1);
      token_tbo.map = tbodyLines = [startLine + 2, 0];
    }

    const token_tro = state.push('tr_open', 'tr', 1);
    token_tro.map = [nextLine, nextLine + 1];

    for (let i = 0; i < columnCount; i++) {
      const token_tdo = state.push('td_open', 'td', 1);
      if (aligns[i]) {
        token_tdo.attrs  = [['style', 'text-align:' + aligns[i]]];
      }

      const token_il = state.push('inline', '', 0);
      token_il.content  = columns[i] ? columns[i].trim() : '';
      token_il.children = [];

      state.push('td_close', 'td', -1);
    }
    state.push('tr_close', 'tr', -1);
  }

  if (tbodyLines) {
    state.push('tbody_close', 'tbody', -1);
    tbodyLines[1] = nextLine;
  }

  state.push('table_close', 'table', -1);
  tableLines[1] = nextLine;

  state.parentType = oldParentType;
  state.line = nextLine;
  return true
}

// Code block (4 spaces padded)

function code$1 (state, startLine, endLine/*, silent */) {
  if (state.sCount[startLine] - state.blkIndent < 4) { return false }

  let nextLine = startLine + 1;
  let last = nextLine;

  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue
    }

    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue
    }
    break
  }

  state.line = last;

  const token   = state.push('code_block', 'code', 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + '\n';
  token.map     = [startLine, state.line];

  return true
}

// fences (``` lang, ~~~ lang)

function fence (state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  if (pos + 3 > max) { return false }

  const marker = state.src.charCodeAt(pos);

  if (marker !== 0x7E/* ~ */ && marker !== 0x60 /* ` */) {
    return false
  }

  // scan marker length
  let mem = pos;
  pos = state.skipChars(pos, marker);

  let len = pos - mem;

  if (len < 3) { return false }

  const markup = state.src.slice(mem, pos);
  const params = state.src.slice(pos, max);

  if (marker === 0x60 /* ` */) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) {
      return false
    }
  }

  // Since start is found, we can report success here in validation mode
  if (silent) { return true }

  // search end of block
  let nextLine = startLine;
  let haveEndMarker = false;

  for (;;) {
    nextLine++;
    if (nextLine >= endLine) {
      // unclosed block should be autoclosed by end of document.
      // also block seems to be autoclosed by end of parent
      break
    }

    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (pos < max && state.sCount[nextLine] < state.blkIndent) {
      // non-empty line with negative indent should stop the list:
      // - ```
      //  test
      break
    }

    if (state.src.charCodeAt(pos) !== marker) { continue }

    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      // closing fence should be indented less than 4 spaces
      continue
    }

    pos = state.skipChars(pos, marker);

    // closing code fence must be at least as long as the opening one
    if (pos - mem < len) { continue }

    // make sure tail has spaces only
    pos = state.skipSpaces(pos);

    if (pos < max) { continue }

    haveEndMarker = true;
    // found!
    break
  }

  // If a fence has heading spaces, they should be removed from its inner block
  len = state.sCount[startLine];

  state.line = nextLine + (haveEndMarker ? 1 : 0);

  const token   = state.push('fence', 'code', 0);
  token.info    = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup  = markup;
  token.map     = [startLine, state.line];

  return true
}

// Block quotes


function blockquote (state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  const oldLineMax = state.lineMax;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  // check the block quote marker
  if (state.src.charCodeAt(pos) !== 0x3E/* > */) { return false }

  // we know that it's going to be a valid blockquote,
  // so no point trying to find the end of it in silent mode
  if (silent) { return true }

  const oldBMarks  = [];
  const oldBSCount = [];
  const oldSCount  = [];
  const oldTShift  = [];

  const terminatorRules = state.md.block.ruler.getRules('blockquote');

  const oldParentType = state.parentType;
  state.parentType = 'blockquote';
  let lastLineEmpty = false;
  let nextLine;

  // Search the end of the block
  //
  // Block ends with either:
  //  1. an empty line outside:
  //     ```
  //     > test
  //
  //     ```
  //  2. an empty line inside:
  //     ```
  //     >
  //     test
  //     ```
  //  3. another tag:
  //     ```
  //     > test
  //      - - -
  //     ```
  for (nextLine = startLine; nextLine < endLine; nextLine++) {
    // check if it's outdented, i.e. it's inside list item and indented
    // less than said list item:
    //
    // ```
    // 1. anything
    //    > current blockquote
    // 2. checking this line
    // ```
    const isOutdented = state.sCount[nextLine] < state.blkIndent;

    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (pos >= max) {
      // Case 1: line is not inside the blockquote, and this line is empty.
      break
    }

    if (state.src.charCodeAt(pos++) === 0x3E/* > */ && !isOutdented) {
      // This line is inside the blockquote.

      // set offset past spaces and ">"
      let initial = state.sCount[nextLine] + 1;
      let spaceAfterMarker;
      let adjustTab;

      // skip one optional space after '>'
      if (state.src.charCodeAt(pos) === 0x20 /* space */) {
        // ' >   test '
        //     ^ -- position start of line here:
        pos++;
        initial++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
        spaceAfterMarker = true;

        if ((state.bsCount[nextLine] + initial) % 4 === 3) {
          // '  >\t  test '
          //       ^ -- position start of line here (tab has width===1)
          pos++;
          initial++;
          adjustTab = false;
        } else {
          // ' >\t  test '
          //    ^ -- position start of line here + shift bsCount slightly
          //         to make extra space appear
          adjustTab = true;
        }
      } else {
        spaceAfterMarker = false;
      }

      let offset = initial;
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;

      while (pos < max) {
        const ch = state.src.charCodeAt(pos);

        if (isSpace(ch)) {
          if (ch === 0x09) {
            offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
          } else {
            offset++;
          }
        } else {
          break
        }

        pos++;
      }

      lastLineEmpty = pos >= max;

      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);

      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;

      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue
    }

    // Case 2: line is not inside the blockquote, and the last line was empty.
    if (lastLineEmpty) { break }

    // Case 3: another tag found.
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break
      }
    }

    if (terminate) {
      // Quirk to enforce "hard termination mode" for paragraphs;
      // normally if you call `tokenize(state, startLine, nextLine)`,
      // paragraphs will look below nextLine for paragraph continuation,
      // but if blockquote is terminated by another tag, they shouldn't
      state.lineMax = nextLine;

      if (state.blkIndent !== 0) {
        // state.blkIndent was non-zero, we now set it to zero,
        // so we need to re-calculate all offsets to appear as
        // if indent wasn't changed
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }

      break
    }

    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);

    // A negative indentation means that this is a paragraph continuation
    //
    state.sCount[nextLine] = -1;
  }

  const oldIndent = state.blkIndent;
  state.blkIndent = 0;

  const token_o  = state.push('blockquote_open', 'blockquote', 1);
  token_o.markup = '>';
  const lines = [startLine, 0];
  token_o.map    = lines;

  state.md.block.tokenize(state, startLine, nextLine);

  const token_c  = state.push('blockquote_close', 'blockquote', -1);
  token_c.markup = '>';

  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;

  // Restore original tShift; this might not be necessary since the parser
  // has already been here, but just to make sure we can do that.
  for (let i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;

  return true
}

// Horizontal rule


function hr (state, startLine, endLine, silent) {
  const max = state.eMarks[startLine];
  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);

  // Check hr marker
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x5F/* _ */) {
    return false
  }

  // markers can be mixed with spaces, but there should be at least 3 of them

  let cnt = 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !isSpace(ch)) { return false }
    if (ch === marker) { cnt++; }
  }

  if (cnt < 3) { return false }

  if (silent) { return true }

  state.line = startLine + 1;

  const token  = state.push('hr', 'hr', 0);
  token.map    = [startLine, state.line];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));

  return true
}

// Lists


// Search `[-+*][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipBulletListMarker (state, startLine) {
  const max = state.eMarks[startLine];
  let pos = state.bMarks[startLine] + state.tShift[startLine];

  const marker = state.src.charCodeAt(pos++);
  // Check bullet
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x2B/* + */) {
    return -1
  }

  if (pos < max) {
    const ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " -test " - is not a list item
      return -1
    }
  }

  return pos
}

// Search `\d+[.)][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipOrderedListMarker (state, startLine) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  let pos = start;

  // List marker should have at least 2 chars (digit + dot)
  if (pos + 1 >= max) { return -1 }

  let ch = state.src.charCodeAt(pos++);

  if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1 }

  for (;;) {
    // EOL -> fail
    if (pos >= max) { return -1 }

    ch = state.src.charCodeAt(pos++);

    if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {
      // List marker should have no more than 9 digits
      // (prevents integer overflow in browsers)
      if (pos - start >= 10) { return -1 }

      continue
    }

    // found valid marker
    if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
      break
    }

    return -1
  }

  if (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " 1.test " - is not a list item
      return -1
    }
  }
  return pos
}

function markTightParagraphs (state, idx) {
  const level = state.level + 2;

  for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
    if (state.tokens[i].level === level && state.tokens[i].type === 'paragraph_open') {
      state.tokens[i + 2].hidden = true;
      state.tokens[i].hidden = true;
      i += 2;
    }
  }
}

function list (state, startLine, endLine, silent) {
  let max, pos, start, token;
  let nextLine = startLine;
  let tight = true;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[nextLine] - state.blkIndent >= 4) { return false }

  // Special case:
  //  - item 1
  //   - item 2
  //    - item 3
  //     - item 4
  //      - this one is a paragraph continuation
  if (state.listIndent >= 0 &&
      state.sCount[nextLine] - state.listIndent >= 4 &&
      state.sCount[nextLine] < state.blkIndent) {
    return false
  }

  let isTerminatingParagraph = false;

  // limit conditions when list can interrupt
  // a paragraph (validation mode only)
  if (silent && state.parentType === 'paragraph') {
    // Next list item should still terminate previous list item;
    //
    // This code can fail if plugins use blkIndent as well as lists,
    // but I hope the spec gets fixed long before that happens.
    //
    if (state.sCount[nextLine] >= state.blkIndent) {
      isTerminatingParagraph = true;
    }
  }

  // Detect list type and position after marker
  let isOrdered;
  let markerValue;
  let posAfterMarker;
  if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[nextLine] + state.tShift[nextLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));

    // If we're starting a new ordered list right after
    // a paragraph, it should start with 1.
    if (isTerminatingParagraph && markerValue !== 1) return false
  } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
    isOrdered = false;
  } else {
    return false
  }

  // If we're starting a new unordered list right after
  // a paragraph, first line should not be empty.
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false
  }

  // For validation mode we can terminate immediately
  if (silent) { return true }

  // We should terminate list on style change. Remember first one to compare.
  const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);

  // Start list
  const listTokIdx = state.tokens.length;

  if (isOrdered) {
    token       = state.push('ordered_list_open', 'ol', 1);
    if (markerValue !== 1) {
      token.attrs = [['start', markerValue]];
    }
  } else {
    token       = state.push('bullet_list_open', 'ul', 1);
  }

  const listLines = [nextLine, 0];
  token.map    = listLines;
  token.markup = String.fromCharCode(markerCharCode);

  //
  // Iterate list items
  //

  let prevEmptyEnd = false;
  const terminatorRules = state.md.block.ruler.getRules('list');

  const oldParentType = state.parentType;
  state.parentType = 'list';

  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];

    const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;

    while (pos < max) {
      const ch = state.src.charCodeAt(pos);

      if (ch === 0x09) {
        offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      } else if (ch === 0x20) {
        offset++;
      } else {
        break
      }

      pos++;
    }

    const contentStart = pos;
    let indentAfterMarker;

    if (contentStart >= max) {
      // trimming space in "-    \n  3" case, indent is 1 here
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = offset - initial;
    }

    // If we have more than 4 spaces, the indent is 1
    // (the rest is just indented code block)
    if (indentAfterMarker > 4) { indentAfterMarker = 1; }

    // "  -  test"
    //  ^^^^^ - calculating total length of this thing
    const indent = initial + indentAfterMarker;

    // Run subparser & write tokens
    token        = state.push('list_item_open', 'li', 1);
    token.markup = String.fromCharCode(markerCharCode);
    const itemLines = [nextLine, 0];
    token.map    = itemLines;
    if (isOrdered) {
      token.info = state.src.slice(start, posAfterMarker - 1);
    }

    // change current state, then restore it after parser subcall
    const oldTight = state.tight;
    const oldTShift = state.tShift[nextLine];
    const oldSCount = state.sCount[nextLine];

    //  - example list
    // ^ listIndent position will be here
    //   ^ blkIndent position will be here
    //
    const oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;

    state.tight = true;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset;

    if (contentStart >= max && state.isEmpty(nextLine + 1)) {
      // workaround for this case
      // (list item is empty, list terminates before "foo"):
      // ~~~~~~~~
      //   -
      //
      //     foo
      // ~~~~~~~~
      state.line = Math.min(state.line + 2, endLine);
    } else {
      state.md.block.tokenize(state, nextLine, endLine, true);
    }

    // If any of list item is tight, mark list as tight
    if (!state.tight || prevEmptyEnd) {
      tight = false;
    }
    // Item become loose if finish with empty line,
    // but we should filter last element, because it means list finish
    prevEmptyEnd = (state.line - nextLine) > 1 && state.isEmpty(state.line - 1);

    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[nextLine] = oldTShift;
    state.sCount[nextLine] = oldSCount;
    state.tight = oldTight;

    token        = state.push('list_item_close', 'li', -1);
    token.markup = String.fromCharCode(markerCharCode);

    nextLine = state.line;
    itemLines[1] = nextLine;

    if (nextLine >= endLine) { break }

    //
    // Try to check if list is terminated or continued.
    //
    if (state.sCount[nextLine] < state.blkIndent) { break }

    // if it's indented more than 3 spaces, it should be a code block
    if (state.sCount[nextLine] - state.blkIndent >= 4) { break }

    // fail if terminating block found
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break
      }
    }
    if (terminate) { break }

    // fail if list has another type
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) { break }
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) { break }
    }

    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break }
  }

  // Finalize list
  if (isOrdered) {
    token = state.push('ordered_list_close', 'ol', -1);
  } else {
    token = state.push('bullet_list_close', 'ul', -1);
  }
  token.markup = String.fromCharCode(markerCharCode);

  listLines[1] = nextLine;
  state.line = nextLine;

  state.parentType = oldParentType;

  // mark paragraphs tight if needed
  if (tight) {
    markTightParagraphs(state, listTokIdx);
  }

  return true
}

function reference (state, startLine, _endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  let nextLine = startLine + 1;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  if (state.src.charCodeAt(pos) !== 0x5B/* [ */) { return false }

  function getNextLine (nextLine) {
    const endLine = state.lineMax;

    if (nextLine >= endLine || state.isEmpty(nextLine)) {
      // empty line or end of input
      return null
    }

    let isContinuation = false;

    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { isContinuation = true; }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { isContinuation = true; }

    if (!isContinuation) {
      const terminatorRules = state.md.block.ruler.getRules('reference');
      const oldParentType = state.parentType;
      state.parentType = 'reference';

      // Some tags can terminate paragraph without empty line.
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break
        }
      }

      state.parentType = oldParentType;
      if (terminate) {
        // terminated by another block
        return null
      }
    }

    const pos = state.bMarks[nextLine] + state.tShift[nextLine];
    const max = state.eMarks[nextLine];

    // max + 1 explicitly includes the newline
    return state.src.slice(pos, max + 1)
  }

  let str = state.src.slice(pos, max + 1);

  max = str.length;
  let labelEnd = -1;

  for (pos = 1; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 0x5B /* [ */) {
      return false
    } else if (ch === 0x5D /* ] */) {
      labelEnd = pos;
      break
    } else if (ch === 0x0A /* \n */) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (ch === 0x5C /* \ */) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 0x0A) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      }
    }
  }

  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 0x3A/* : */) { return false }

  // [label]:   destination   'title'
  //         ^^^ skip optional whitespace here
  for (pos = labelEnd + 2; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 0x0A) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) ; else {
      break
    }
  }

  // [label]:   destination   'title'
  //            ^^^^^^^^^^^ parse this
  const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!destRes.ok) { return false }

  const href = state.md.normalizeLink(destRes.str);
  if (!state.md.validateLink(href)) { return false }

  pos = destRes.pos;

  // save cursor state, we could require to rollback later
  const destEndPos = pos;
  const destEndLineNo = nextLine;

  // [label]:   destination   'title'
  //                       ^^^ skipping those spaces
  const start = pos;
  for (; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 0x0A) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) ; else {
      break
    }
  }

  // [label]:   destination   'title'
  //                          ^^^^^^^ parse this
  let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
  while (titleRes.can_continue) {
    const lineContent = getNextLine(nextLine);
    if (lineContent === null) break
    str += lineContent;
    pos = max;
    max = str.length;
    nextLine++;
    titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
  }
  let title;

  if (pos < max && start !== pos && titleRes.ok) {
    title = titleRes.str;
    pos = titleRes.pos;
  } else {
    title = '';
    pos = destEndPos;
    nextLine = destEndLineNo;
  }

  // skip trailing spaces until the rest of the line
  while (pos < max) {
    const ch = str.charCodeAt(pos);
    if (!isSpace(ch)) { break }
    pos++;
  }

  if (pos < max && str.charCodeAt(pos) !== 0x0A) {
    if (title) {
      // garbage at the end of the line after title,
      // but it could still be a valid reference if we roll back
      title = '';
      pos = destEndPos;
      nextLine = destEndLineNo;
      while (pos < max) {
        const ch = str.charCodeAt(pos);
        if (!isSpace(ch)) { break }
        pos++;
      }
    }
  }

  if (pos < max && str.charCodeAt(pos) !== 0x0A) {
    // garbage at the end of the line
    return false
  }

  const label = normalizeReference(str.slice(1, labelEnd));
  if (!label) {
    // CommonMark 0.20 disallows empty labels
    return false
  }

  // Reference can not terminate anything. This check is for safety only.
  /* istanbul ignore if */
  if (silent) { return true }

  if (typeof state.env.references === 'undefined') {
    state.env.references = {};
  }
  if (typeof state.env.references[label] === 'undefined') {
    state.env.references[label] = { title, href };
  }

  state.line = nextLine;
  return true
}

// List of valid html blocks names, according to commonmark spec
// https://spec.commonmark.org/0.30/#html-blocks

var block_names = [
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul'
];

// Regexps to match html elements

const attr_name     = '[a-zA-Z_:][a-zA-Z0-9:._-]*';

const unquoted      = '[^"\'=<>`\\x00-\\x20]+';
const single_quoted = "'[^']*'";
const double_quoted = '"[^"]*"';

const attr_value  = '(?:' + unquoted + '|' + single_quoted + '|' + double_quoted + ')';

const attribute   = '(?:\\s+' + attr_name + '(?:\\s*=\\s*' + attr_value + ')?)';

const open_tag    = '<[A-Za-z][A-Za-z0-9\\-]*' + attribute + '*\\s*\\/?>';

const close_tag   = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
const comment     = '<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->';
const processing  = '<[?][\\s\\S]*?[?]>';
const declaration = '<![A-Za-z][^>]*>';
const cdata       = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';

const HTML_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + '|' + comment +
                        '|' + processing + '|' + declaration + '|' + cdata + ')');
const HTML_OPEN_CLOSE_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + ')');

// HTML block


// An array of opening and corresponding closing sequences for html tags,
// last argument defines whether it can terminate a paragraph or not
//
const HTML_SEQUENCES = [
  [/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true],
  [/^<!--/,        /-->/,   true],
  [/^<\?/,         /\?>/,   true],
  [/^<![A-Z]/,     />/,     true],
  [/^<!\[CDATA\[/, /\]\]>/, true],
  [new RegExp('^</?(' + block_names.join('|') + ')(?=(\\s|/?>|$))', 'i'), /^$/, true],
  [new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + '\\s*$'),  /^$/, false]
];

function html_block (state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  if (!state.md.options.html) { return false }

  if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false }

  let lineText = state.src.slice(pos, max);

  let i = 0;
  for (; i < HTML_SEQUENCES.length; i++) {
    if (HTML_SEQUENCES[i][0].test(lineText)) { break }
  }
  if (i === HTML_SEQUENCES.length) { return false }

  if (silent) {
    // true if this sequence can be a terminator, false otherwise
    return HTML_SEQUENCES[i][2]
  }

  let nextLine = startLine + 1;

  // Block types 6 and 7 (the only ones whose end condition is a blank line)
  // have `/^$/` as their closing regexp. For all other types (1-5, e.g.
  // `<!--` comments), a blank line is regular content and must not terminate
  // the block - it ends only when its closing sequence is found.
  const endsOnBlankLine = HTML_SEQUENCES[i][1].test('');

  // If we are here - we detected HTML block.
  // Let's roll down till block end.
  if (!HTML_SEQUENCES[i][1].test(lineText)) {
    for (; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) {
        // An outdented blank line shouldn't end a block that doesn't end on a
        // blank line (e.g. a `<!--` comment inside a list item). Such blocks
        // must continue until their closing sequence regardless of indent.
        if (endsOnBlankLine || !state.isEmpty(nextLine)) { break }
      }

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      lineText = state.src.slice(pos, max);

      if (HTML_SEQUENCES[i][1].test(lineText)) {
        if (lineText.length !== 0) { nextLine++; }
        break
      }
    }
  }

  state.line = nextLine;

  const token   = state.push('html_block', '', 0);
  token.map     = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);

  return true
}

// heading (#, ##, ...)


function heading (state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  let ch  = state.src.charCodeAt(pos);

  if (ch !== 0x23/* # */ || pos >= max) { return false }

  // count heading level
  let level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 0x23/* # */ && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }

  if (level > 6 || (pos < max && !isSpace(ch))) { return false }

  if (silent) { return true }

  // Let's cut tails like '    ###  ' from the end of string

  max = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(max, 0x23, pos); // #
  if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
    max = tmp;
  }

  state.line = startLine + 1;

  const token_o  = state.push('heading_open', 'h' + String(level), 1);
  token_o.markup = '########'.slice(0, level);
  token_o.map    = [startLine, state.line];

  const token_i    = state.push('inline', '', 0);
  token_i.content  = asciiTrim(state.src.slice(pos, max));
  token_i.map      = [startLine, state.line];
  token_i.children = [];

  const token_c  = state.push('heading_close', 'h' + String(level), -1);
  token_c.markup = '########'.slice(0, level);

  return true
}

// lheading (---, ===)


function lheading (state, startLine, endLine/*, silent */) {
  const terminatorRules = state.md.block.ruler.getRules('paragraph');

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false }

  const oldParentType = state.parentType;
  state.parentType = 'paragraph'; // use paragraph to match terminatorRules

  // jump line-by-line until empty one or EOF
  let level = 0;
  let marker;
  let nextLine = startLine + 1;

  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { continue }

    //
    // Check for underline in setext header
    //
    if (state.sCount[nextLine] >= state.blkIndent) {
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];

      if (pos < max) {
        marker = state.src.charCodeAt(pos);

        if (marker === 0x2D/* - */ || marker === 0x3D/* = */) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);

          if (pos >= max) {
            level = (marker === 0x3D/* = */ ? 1 : 2);
            break
          }
        }
      }
    }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { continue }

    // Some tags can terminate paragraph without empty line.
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break
      }
    }
    if (terminate) { break }
  }

  if (!level) {
    // Didn't find valid underline
    state.parentType = oldParentType;
    return false
  }

  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));

  state.line = nextLine + 1;

  const token_o    = state.push('heading_open', 'h' + String(level), 1);
  token_o.markup   = String.fromCharCode(marker);
  token_o.map      = [startLine, state.line];

  const token_i    = state.push('inline', '', 0);
  token_i.content  = content;
  token_i.map      = [startLine, state.line - 1];
  token_i.children = [];

  const token_c    = state.push('heading_close', 'h' + String(level), -1);
  token_c.markup   = String.fromCharCode(marker);

  state.parentType = oldParentType;

  return true
}

// Paragraph


function paragraph (state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules('paragraph');
  const oldParentType = state.parentType;
  let nextLine = startLine + 1;
  state.parentType = 'paragraph';

  // jump line-by-line until empty one or EOF
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { continue }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { continue }

    // Some tags can terminate paragraph without empty line.
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break
      }
    }
    if (terminate) { break }
  }

  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));

  state.line = nextLine;

  const token_o    = state.push('paragraph_open', 'p', 1);
  token_o.map      = [startLine, state.line];

  const token_i    = state.push('inline', '', 0);
  token_i.content  = content;
  token_i.map      = [startLine, state.line];
  token_i.children = [];

  state.push('paragraph_close', 'p', -1);

  state.parentType = oldParentType;

  return true
}

/** internal
 * class ParserBlock
 *
 * Block-level tokenizer.
 **/


const _rules$1 = [
  // First 2 params - rule name & source. Secondary array - list of rules,
  // which can be terminated by this one.
  ['table',      table,      ['paragraph', 'reference']],
  ['code',       code$1],
  ['fence',      fence,      ['paragraph', 'reference', 'blockquote', 'list']],
  ['blockquote', blockquote, ['paragraph', 'reference', 'blockquote', 'list']],
  ['hr',         hr,         ['paragraph', 'reference', 'blockquote', 'list']],
  ['list',       list,       ['paragraph', 'reference', 'blockquote']],
  ['reference',  reference],
  ['html_block', html_block, ['paragraph', 'reference', 'blockquote']],
  ['heading',    heading,    ['paragraph', 'reference', 'blockquote']],
  ['lheading',   lheading],
  ['paragraph',  paragraph]
];

/**
 * new ParserBlock()
 **/
function ParserBlock () {
  /**
   * ParserBlock#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of block rules.
   **/
  this.ruler = new Ruler();

  for (let i = 0; i < _rules$1.length; i++) {
    this.ruler.push(_rules$1[i][0], _rules$1[i][1], { alt: (_rules$1[i][2] || []).slice() });
  }
}

// Generate tokens for input range
//
ParserBlock.prototype.tokenize = function (state, startLine, endLine) {
  const rules = this.ruler.getRules('');
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  let line = startLine;
  let hasEmptyLines = false;

  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) { break }

    // Termination condition for nested calls.
    // Nested calls currently used for blockquotes & lists
    if (state.sCount[line] < state.blkIndent) { break }

    // If nesting level exceeded - skip tail to the end. That's not ordinary
    // situation and we should not care about content.
    if (state.level >= maxNesting) {
      state.line = endLine;
      break
    }

    // Try all possible rules.
    // On success, rule should:
    //
    // - update `state.line`
    // - update `state.tokens`
    // - return true
    const prevLine = state.line;
    let ok = false;

    for (let i = 0; i < len; i++) {
      ok = rules[i](state, line, endLine, false);
      if (ok) {
        if (prevLine >= state.line) {
          throw new Error("block rule didn't increment state.line")
        }
        break
      }
    }

    // this can only happen if user disables paragraph rule
    if (!ok) throw new Error('none of the block rules matched')

    // set state.tight if we had an empty line before current tag
    // i.e. latest empty line should not count
    state.tight = !hasEmptyLines;

    // paragraph might "eat" one newline after it in nested lists
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }

    line = state.line;

    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      state.line = line;
    }
  }
};

/**
 * ParserBlock.parse(str, md, env, outTokens)
 *
 * Process input string and push block tokens into `outTokens`
 **/
ParserBlock.prototype.parse = function (src, md, env, outTokens) {
  if (!src) { return }

  const state = new this.State(src, md, env, outTokens);

  this.tokenize(state, state.line, state.lineMax);
};

ParserBlock.prototype.State = StateBlock;

// Inline parser state


function StateInline (src, md, env, outTokens) {
  this.src = src;
  this.env = env;
  this.md = md;
  this.tokens = outTokens;
  this.tokens_meta = Array(outTokens.length);

  this.pos = 0;
  this.posMax = this.src.length;
  this.level = 0;
  this.pending = '';
  this.pendingLevel = 0;

  // Stores { start: end } pairs. Useful for backtrack
  // optimization of pairs parse (emphasis, strikes).
  this.cache = {};

  // List of emphasis-like delimiters for current tag
  this.delimiters = [];

  // Stack of delimiter lists for upper level tags
  this._prev_delimiters = [];

  // backtick length => last seen position
  this.backticks = {};
  this.backticksScanned = false;

  // Counter used to disable inline linkify-it execution
  // inside <a> and markdown links
  this.linkLevel = 0;
}

// Flush pending text
//
StateInline.prototype.pushPending = function () {
  const token = new Token('text', '', 0);
  token.content = this.pending;
  token.level = this.pendingLevel;
  this.tokens.push(token);
  this.pending = '';
  return token
};

// Push new token to "stream".
// If pending text exists - flush it as text token
//
StateInline.prototype.push = function (type, tag, nesting) {
  if (this.pending) {
    this.pushPending();
  }

  const token = new Token(type, tag, nesting);
  let token_meta = null;

  if (nesting < 0) {
    // closing tag
    this.level--;
    this.delimiters = this._prev_delimiters.pop();
  }

  token.level = this.level;

  if (nesting > 0) {
    // opening tag
    this.level++;
    this._prev_delimiters.push(this.delimiters);
    this.delimiters = [];
    token_meta = { delimiters: this.delimiters };
  }

  this.pendingLevel = this.level;
  this.tokens.push(token);
  this.tokens_meta.push(token_meta);
  return token
};

// Scan a sequence of emphasis-like markers, and determine whether
// it can start an emphasis sequence or end an emphasis sequence.
//
//  - start - position to scan from (it should point at a valid marker);
//  - canSplitWord - determine if these markers can be found inside a word
//
StateInline.prototype.scanDelims = function (start, canSplitWord) {
  const max = this.posMax;
  const marker = this.src.charCodeAt(start);

  // Astral characters below are combined manually, because .codePointAt()
  // does not guarantee numeric type output. And we don't wish JIT cache issues.
  // The broken surrogate pairs are evaluated as U+FFFD to prevent possible
  // crashes.

  let lastChar;
  if (start === 0) {
    // treat beginning of the line as a whitespace
    lastChar = 0x20;
  } else if (start === 1) {
    lastChar = this.src.charCodeAt(0);
    if ((lastChar & 0xF800) === 0xD800) { lastChar = 0xFFFD; }
  } else {
    lastChar = this.src.charCodeAt(start - 1);
    if ((lastChar & 0xFC00) === 0xDC00) {
      // low surrogate => add high one, replace broken pair with U+FFFD
      const highSurr = this.src.charCodeAt(start - 2);
      lastChar = (highSurr & 0xFC00) === 0xD800
        ? 0x10000 + ((highSurr - 0xD800) << 10) + (lastChar - 0xDC00)
        : 0xFFFD;
    } else if ((lastChar & 0xFC00) === 0xD800) {
      lastChar = 0xFFFD;
    }
  }

  let pos = start;
  while (pos < max && this.src.charCodeAt(pos) === marker) { pos++; }

  const count = pos - start;

  // treat end of the line as a whitespace
  let nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;
  if ((nextChar & 0xFC00) === 0xD800) {
    // high surrogate => add low one, replace broken pair with U+FFFD
    const lowSurr = this.src.charCodeAt(pos + 1);
    nextChar = (lowSurr & 0xFC00) === 0xDC00
      ? 0x10000 + ((nextChar - 0xD800) << 10) + (lowSurr - 0xDC00)
      : 0xFFFD;
  } else if ((nextChar & 0xFC00) === 0xDC00) {
    nextChar = 0xFFFD;
  }

  const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
  const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);

  const isLastWhiteSpace = isWhiteSpace(lastChar);
  const isNextWhiteSpace = isWhiteSpace(nextChar);

  const left_flanking =
    !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
  const right_flanking =
    !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);

  const can_open  = left_flanking  && (canSplitWord || !right_flanking || isLastPunctChar);
  const can_close = right_flanking && (canSplitWord || !left_flanking  || isNextPunctChar);

  return { can_open, can_close, length: count }
};

// re-export Token class to use in block rules
StateInline.prototype.Token = Token;

// Skip text characters for text token, place those to pending buffer
// and increment current pos

// Rule to skip pure text
// '{}$%@~+=:' reserved for extentions

// !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~

// !!!! Don't confuse with "Markdown ASCII Punctuation" chars
// http://spec.commonmark.org/0.15/#ascii-punctuation-character
function isTerminatorChar (ch) {
  switch (ch) {
    case 0x0A/* \n */:
    case 0x21/* ! */:
    case 0x23/* # */:
    case 0x24/* $ */:
    case 0x25/* % */:
    case 0x26/* & */:
    case 0x2A/* * */:
    case 0x2B/* + */:
    case 0x2D/* - */:
    case 0x3A/* : */:
    case 0x3C/* < */:
    case 0x3D/* = */:
    case 0x3E/* > */:
    case 0x40/* @ */:
    case 0x5B/* [ */:
    case 0x5C/* \ */:
    case 0x5D/* ] */:
    case 0x5E/* ^ */:
    case 0x5F/* _ */:
    case 0x60/* ` */:
    case 0x7B/* { */:
    case 0x7D/* } */:
    case 0x7E/* ~ */:
      return true
    default:
      return false
  }
}

function text (state, silent) {
  let pos = state.pos;

  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }

  if (pos === state.pos) { return false }

  if (!silent) { state.pending += state.src.slice(state.pos, pos); }

  state.pos = pos;

  return true
}

// Alternative implementation, for memory.
//
// It costs 10% of performance, but allows extend terminators list, if place it
// to `ParserInline` property. Probably, will switch to it sometime, such
// flexibility required.

/*
var TERMINATOR_RE = /[\n!#$%&*+\-:<=>@[\\\]^_`{}~]/;

module.exports = function text(state, silent) {
  var pos = state.pos,
      idx = state.src.slice(pos).search(TERMINATOR_RE);

  // first char is terminator -> empty text
  if (idx === 0) { return false; }

  // no terminator -> text till end of string
  if (idx < 0) {
    if (!silent) { state.pending += state.src.slice(pos); }
    state.pos = state.src.length;
    return true;
  }

  if (!silent) { state.pending += state.src.slice(pos, pos + idx); }

  state.pos += idx;

  return true;
}; */

// Process links like https://example.org/

// RFC3986: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
const SCHEME_RE = /(?:^|[^a-z0-9.+-])([a-z][a-z0-9.+-]*)$/i;

function linkify (state, silent) {
  if (!state.md.options.linkify) return false
  if (state.linkLevel > 0) return false

  const pos = state.pos;
  const max = state.posMax;

  if (pos + 3 > max) return false
  if (state.src.charCodeAt(pos) !== 0x3A/* : */) return false
  if (state.src.charCodeAt(pos + 1) !== 0x2F/* / */) return false
  if (state.src.charCodeAt(pos + 2) !== 0x2F/* / */) return false

  const match = state.pending.match(SCHEME_RE);
  if (!match) return false

  const proto = match[1];

  const link = state.md.linkify.matchAtStart(state.src.slice(pos - proto.length));
  if (!link) return false

  let url = link.url;

  // invalid link, but still detected by linkify somehow;
  // need to check to prevent infinite loop below
  if (url.length <= proto.length) return false

  // disallow '*' at the end of the link (conflicts with emphasis)
  // do manual backsearch to avoid perf issues with regex /\*+$/ on "****...****a".
  let urlEnd = url.length;
  while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 0x2A/* * */) {
    urlEnd--;
  }
  if (urlEnd !== url.length) {
    url = url.slice(0, urlEnd);
  }

  const fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false

  if (!silent) {
    state.pending = state.pending.slice(0, -proto.length);

    const token_o = state.push('link_open', 'a', 1);
    token_o.attrs = [['href', fullUrl]];
    token_o.markup = 'linkify';
    token_o.info = 'auto';

    const token_t = state.push('text', '', 0);
    token_t.content = state.md.normalizeLinkText(url);

    const token_c = state.push('link_close', 'a', -1);
    token_c.markup = 'linkify';
    token_c.info = 'auto';
  }

  state.pos += url.length - proto.length;
  return true
}

// Proceess '\n'


function newline (state, silent) {
  let pos = state.pos;

  if (state.src.charCodeAt(pos) !== 0x0A/* \n */) { return false }

  const pmax = state.pending.length - 1;
  const max = state.posMax;

  // '  \n' -> hardbreak
  // Lookup in pending chars is bad practice! Don't copy to other rules!
  // Pending string is stored in concat mode, indexed lookups will cause
  // convertion to flat mode.
  if (!silent) {
    if (pmax >= 0 && state.pending.charCodeAt(pmax) === 0x20) {
      if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 0x20) {
        // Find whitespaces tail of pending chars.
        let ws = pmax - 1;
        while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 0x20) ws--;

        state.pending = state.pending.slice(0, ws);
        state.push('hardbreak', 'br', 0);
      } else {
        state.pending = state.pending.slice(0, -1);
        state.push('softbreak', 'br', 0);
      }
    } else {
      state.push('softbreak', 'br', 0);
    }
  }

  pos++;

  // skip heading spaces for next line
  while (pos < max && isSpace(state.src.charCodeAt(pos))) { pos++; }

  state.pos = pos;
  return true
}

// Process escaped chars and hardbreaks


const ESCAPED = [];

for (let i = 0; i < 256; i++) { ESCAPED.push(0); }

'\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'
  .split('').forEach(function (ch) { ESCAPED[ch.charCodeAt(0)] = 1; });

function escape (state, silent) {
  let pos = state.pos;
  const max = state.posMax;

  if (state.src.charCodeAt(pos) !== 0x5C/* \ */) return false
  pos++;

  // '\' at the end of the inline block
  if (pos >= max) return false

  let ch1 = state.src.charCodeAt(pos);

  if (ch1 === 0x0A) {
    if (!silent) {
      state.push('hardbreak', 'br', 0);
    }

    pos++;
    // skip leading whitespaces from next line
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!isSpace(ch1)) break
      pos++;
    }

    state.pos = pos;
    return true
  }

  let escapedStr = state.src[pos];

  if (ch1 >= 0xD800 && ch1 <= 0xDBFF && pos + 1 < max) {
    const ch2 = state.src.charCodeAt(pos + 1);

    if (ch2 >= 0xDC00 && ch2 <= 0xDFFF) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }

  const origStr = '\\' + escapedStr;

  if (!silent) {
    const token = state.push('text_special', '', 0);

    if (ch1 < 256 && ESCAPED[ch1] !== 0) {
      token.content = escapedStr;
    } else {
      token.content = origStr;
    }

    token.markup = origStr;
    token.info   = 'escape';
  }

  state.pos = pos + 1;
  return true
}

// Parse backticks

function backtick (state, silent) {
  let pos = state.pos;
  const ch = state.src.charCodeAt(pos);

  if (ch !== 0x60/* ` */) { return false }

  const start = pos;
  pos++;
  const max = state.posMax;

  // scan marker length
  while (pos < max && state.src.charCodeAt(pos) === 0x60/* ` */) { pos++; }

  const marker = state.src.slice(start, pos);
  const openerLength = marker.length;

  if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true
  }

  let matchEnd = pos;
  let matchStart;

  // Nothing found in the cache, scan until the end of the line (or until marker is found)
  while ((matchStart = state.src.indexOf('`', matchEnd)) !== -1) {
    matchEnd = matchStart + 1;

    // scan marker length
    while (matchEnd < max && state.src.charCodeAt(matchEnd) === 0x60/* ` */) { matchEnd++; }

    const closerLength = matchEnd - matchStart;

    if (closerLength === openerLength) {
      // Found matching closer length.
      if (!silent) {
        const token = state.push('code_inline', 'code', 0);
        token.markup = marker;
        token.content = state.src.slice(pos, matchStart)
          .replace(/\n/g, ' ')
          .replace(/^ (.+) $/, '$1');
      }
      state.pos = matchEnd;
      return true
    }

    // Some different length found, put it in cache as upper limit of where closer can be found
    state.backticks[closerLength] = matchStart;
  }

  // Scanned through the end, didn't find anything
  state.backticksScanned = true;

  if (!silent) state.pending += marker;
  state.pos += openerLength;
  return true
}

// ~~strike through~~
//

// Insert each marker as a separate text token, and add it to delimiter list
//
function strikethrough_tokenize (state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);

  if (silent) { return false }

  if (marker !== 0x7E/* ~ */) { return false }

  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  const ch = String.fromCharCode(marker);

  if (len < 2) { return false }

  let token;

  if (len % 2) {
    token         = state.push('text', '', 0);
    token.content = ch;
    len--;
  }

  for (let i = 0; i < len; i += 2) {
    token         = state.push('text', '', 0);
    token.content = ch + ch;

    state.delimiters.push({
      marker,
      length: 0,     // disable "rule of 3" length checks meant for emphasis
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }

  state.pos += scanned.length;

  return true
}

function postProcess$1 (state, delimiters) {
  let token;
  const loneMarkers = [];
  const max = delimiters.length;

  for (let i = 0; i < max; i++) {
    const startDelim = delimiters[i];

    if (startDelim.marker !== 0x7E/* ~ */) {
      continue
    }

    if (startDelim.end === -1) {
      continue
    }

    const endDelim = delimiters[startDelim.end];

    token         = state.tokens[startDelim.token];
    token.type    = 's_open';
    token.tag     = 's';
    token.nesting = 1;
    token.markup  = '~~';
    token.content = '';

    token         = state.tokens[endDelim.token];
    token.type    = 's_close';
    token.tag     = 's';
    token.nesting = -1;
    token.markup  = '~~';
    token.content = '';

    if (state.tokens[endDelim.token - 1].type === 'text' &&
        state.tokens[endDelim.token - 1].content === '~') {
      loneMarkers.push(endDelim.token - 1);
    }
  }

  // If a marker sequence has an odd number of characters, it's splitted
  // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
  // start of the sequence.
  //
  // So, we have to move all those markers after subsequent s_close tags.
  //
  while (loneMarkers.length) {
    const i = loneMarkers.pop();
    let j = i + 1;

    while (j < state.tokens.length && state.tokens[j].type === 's_close') {
      j++;
    }

    j--;

    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}

// Walk through delimiter list and replace text tokens with tags
//
function strikethrough_postProcess (state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;

  postProcess$1(state, state.delimiters);

  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess$1(state, tokens_meta[curr].delimiters);
    }
  }
}

var r_strikethrough = {
  tokenize: strikethrough_tokenize,
  postProcess: strikethrough_postProcess
};

// Process *this* and _that_
//

// Insert each marker as a separate text token, and add it to delimiter list
//
function emphasis_tokenize (state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);

  if (silent) { return false }

  if (marker !== 0x5F /* _ */ && marker !== 0x2A /* * */) { return false }

  const scanned = state.scanDelims(state.pos, marker === 0x2A);

  for (let i = 0; i < scanned.length; i++) {
    const token = state.push('text', '', 0);
    token.content = String.fromCharCode(marker);

    state.delimiters.push({
      // Char code of the starting marker (number).
      //
      marker,

      // Total length of these series of delimiters.
      //
      length: scanned.length,

      // A position of the token this delimiter corresponds to.
      //
      token: state.tokens.length - 1,

      // If this delimiter is matched as a valid opener, `end` will be
      // equal to its position, otherwise it's `-1`.
      //
      end: -1,

      // Boolean flags that determine if this delimiter could open or close
      // an emphasis.
      //
      open: scanned.can_open,
      close: scanned.can_close
    });
  }

  state.pos += scanned.length;

  return true
}

function postProcess (state, delimiters) {
  const max = delimiters.length;

  for (let i = max - 1; i >= 0; i--) {
    const startDelim = delimiters[i];

    if (startDelim.marker !== 0x5F/* _ */ && startDelim.marker !== 0x2A/* * */) {
      continue
    }

    // Process only opening markers
    if (startDelim.end === -1) {
      continue
    }

    const endDelim = delimiters[startDelim.end];

    // If the previous delimiter has the same marker and is adjacent to this one,
    // merge those into one strong delimiter.
    //
    // `<em><em>whatever</em></em>` -> `<strong>whatever</strong>`
    //
    const isStrong = i > 0 &&
               delimiters[i - 1].end === startDelim.end + 1 &&
               // check that first two markers match and adjacent
               delimiters[i - 1].marker === startDelim.marker &&
               delimiters[i - 1].token === startDelim.token - 1 &&
               // check that last two markers are adjacent (we can safely assume they match)
               delimiters[startDelim.end + 1].token === endDelim.token + 1;

    const ch = String.fromCharCode(startDelim.marker);

    const token_o   = state.tokens[startDelim.token];
    token_o.type    = isStrong ? 'strong_open' : 'em_open';
    token_o.tag     = isStrong ? 'strong' : 'em';
    token_o.nesting = 1;
    token_o.markup  = isStrong ? ch + ch : ch;
    token_o.content = '';

    const token_c   = state.tokens[endDelim.token];
    token_c.type    = isStrong ? 'strong_close' : 'em_close';
    token_c.tag     = isStrong ? 'strong' : 'em';
    token_c.nesting = -1;
    token_c.markup  = isStrong ? ch + ch : ch;
    token_c.content = '';

    if (isStrong) {
      state.tokens[delimiters[i - 1].token].content = '';
      state.tokens[delimiters[startDelim.end + 1].token].content = '';
      i--;
    }
  }
}

// Walk through delimiter list and replace text tokens with tags
//
function emphasis_post_process (state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;

  postProcess(state, state.delimiters);

  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
}

var r_emphasis = {
  tokenize: emphasis_tokenize,
  postProcess: emphasis_post_process
};

// Process [link](<to> "stuff")


function link (state, silent) {
  let code, label, res, ref;
  let href = '';
  let title = '';
  let start = state.pos;
  let parseReference = true;

  if (state.src.charCodeAt(state.pos) !== 0x5B/* [ */) { return false }

  const oldPos = state.pos;
  const max = state.posMax;
  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);

  // parser failed to find ']', so it's not a valid link
  if (labelEnd < 0) { return false }

  let pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
    //
    // Inline link
    //

    // might have found a valid shortcut link, disable reference parsing
    parseReference = false;

    // [link](  <href>  "title"  )
    //        ^^ skipping these spaces
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break }
    }
    if (pos >= max) { return false }

    // [link](  <href>  "title"  )
    //          ^^^^^^ parsing link destination
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = '';
      }

      // [link](  <href>  "title"  )
      //                ^^ skipping these spaces
      start = pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!isSpace(code) && code !== 0x0A) { break }
      }

      // [link](  <href>  "title"  )
      //                  ^^^^^^^ parsing link title
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;

        // [link](  <href>  "title"  )
        //                         ^^ skipping these spaces
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break }
        }
      }
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
      // parsing a valid shortcut link failed, fallback to reference
      parseReference = true;
    }
    pos++;
  }

  if (parseReference) {
    //
    // Link reference
    //
    if (typeof state.env.references === 'undefined') { return false }

    if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    // covers label === '' and label === undefined
    // (collapsed reference link and shortcut reference link respectively)
    if (!label) { label = state.src.slice(labelStart, labelEnd); }

    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false
    }
    href = ref.href;
    title = ref.title;
  }

  //
  // We found the end of the link, and know for a fact it's a valid link;
  // so all that's left to do is to call tokenizer.
  //
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;

    const token_o = state.push('link_open', 'a', 1);
    const attrs = [['href', href]];
    token_o.attrs  = attrs;
    if (title) {
      attrs.push(['title', title]);
    }

    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;

    state.push('link_close', 'a', -1);
  }

  state.pos = pos;
  state.posMax = max;
  return true
}

// Process ![image](<src> "title")


function image (state, silent) {
  let code, content, label, pos, ref, res, title, start;
  let href = '';
  const oldPos = state.pos;
  const max = state.posMax;

  if (state.src.charCodeAt(state.pos) !== 0x21/* ! */) { return false }
  if (state.src.charCodeAt(state.pos + 1) !== 0x5B/* [ */) { return false }

  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);

  // parser failed to find ']', so it's not a valid link
  if (labelEnd < 0) { return false }

  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
    //
    // Inline link
    //

    // [link](  <href>  "title"  )
    //        ^^ skipping these spaces
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break }
    }
    if (pos >= max) { return false }

    // [link](  <href>  "title"  )
    //          ^^^^^^ parsing link destination
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = '';
      }
    }

    // [link](  <href>  "title"  )
    //                ^^ skipping these spaces
    start = pos;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break }
    }

    // [link](  <href>  "title"  )
    //                  ^^^^^^^ parsing link title
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;

      // [link](  <href>  "title"  )
      //                         ^^ skipping these spaces
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!isSpace(code) && code !== 0x0A) { break }
      }
    } else {
      title = '';
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
      state.pos = oldPos;
      return false
    }
    pos++;
  } else {
    //
    // Link reference
    //
    if (typeof state.env.references === 'undefined') { return false }

    if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    // covers label === '' and label === undefined
    // (collapsed reference link and shortcut reference link respectively)
    if (!label) { label = state.src.slice(labelStart, labelEnd); }

    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false
    }
    href = ref.href;
    title = ref.title;
  }

  //
  // We found the end of the link, and know for a fact it's a valid link;
  // so all that's left to do is to call tokenizer.
  //
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);

    const tokens = [];
    state.md.inline.parse(
      content,
      state.md,
      state.env,
      tokens
    );

    const token = state.push('image', 'img', 0);
    const attrs = [['src', href], ['alt', '']];
    token.attrs = attrs;
    token.children = tokens;
    token.content = content;

    if (title) {
      attrs.push(['title', title]);
    }
  }

  state.pos = pos;
  state.posMax = max;
  return true
}

// Process autolinks '<protocol:...>'

/* eslint max-len:0 */
const EMAIL_RE    = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
/* eslint-disable-next-line no-control-regex */
const AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;

function autolink (state, silent) {
  let pos = state.pos;

  if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false }

  const start = state.pos;
  const max = state.posMax;

  for (;;) {
    if (++pos >= max) return false

    const ch = state.src.charCodeAt(pos);

    if (ch === 0x3C /* < */) return false
    if (ch === 0x3E /* > */) break
  }

  const url = state.src.slice(start + 1, pos);

  if (AUTOLINK_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) { return false }

    if (!silent) {
      const token_o   = state.push('link_open', 'a', 1);
      token_o.attrs   = [['href', fullUrl]];
      token_o.markup  = 'autolink';
      token_o.info    = 'auto';

      const token_t   = state.push('text', '', 0);
      token_t.content = state.md.normalizeLinkText(url);

      const token_c   = state.push('link_close', 'a', -1);
      token_c.markup  = 'autolink';
      token_c.info    = 'auto';
    }

    state.pos += url.length + 2;
    return true
  }

  if (EMAIL_RE.test(url)) {
    const fullUrl = state.md.normalizeLink('mailto:' + url);
    if (!state.md.validateLink(fullUrl)) { return false }

    if (!silent) {
      const token_o   = state.push('link_open', 'a', 1);
      token_o.attrs   = [['href', fullUrl]];
      token_o.markup  = 'autolink';
      token_o.info    = 'auto';

      const token_t   = state.push('text', '', 0);
      token_t.content = state.md.normalizeLinkText(url);

      const token_c   = state.push('link_close', 'a', -1);
      token_c.markup  = 'autolink';
      token_c.info    = 'auto';
    }

    state.pos += url.length + 2;
    return true
  }

  return false
}

// Process html tags


function isLinkOpen (str) {
  return /^<a[>\s]/i.test(str)
}
function isLinkClose (str) {
  return /^<\/a\s*>/i.test(str)
}

function isLetter (ch) {
  /* eslint no-bitwise:0 */
  const lc = ch | 0x20; // to lower case
  return (lc >= 0x61/* a */) && (lc <= 0x7a/* z */)
}

function html_inline (state, silent) {
  if (!state.md.options.html) { return false }

  // Check start
  const max = state.posMax;
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 0x3C/* < */ ||
      pos + 2 >= max) {
    return false
  }

  // Quick fail on second char
  const ch = state.src.charCodeAt(pos + 1);
  if (ch !== 0x21/* ! */ &&
      ch !== 0x3F/* ? */ &&
      ch !== 0x2F/* / */ &&
      !isLetter(ch)) {
    return false
  }

  const match = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match) { return false }

  if (!silent) {
    const token = state.push('html_inline', '', 0);
    token.content = match[0];

    if (isLinkOpen(token.content))  state.linkLevel++;
    if (isLinkClose(token.content)) state.linkLevel--;
  }
  state.pos += match[0].length;
  return true
}

// Process html entity - &#123;, &#xAF;, &quot;, ...


const DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
const NAMED_RE   = /^&([a-z][a-z0-9]{1,31});/i;

function entity (state, silent) {
  const pos = state.pos;
  const max = state.posMax;

  if (state.src.charCodeAt(pos) !== 0x26/* & */) return false

  if (pos + 1 >= max) return false

  const ch = state.src.charCodeAt(pos + 1);

  if (ch === 0x23 /* # */) {
    const match = state.src.slice(pos).match(DIGITAL_RE);
    if (match) {
      if (!silent) {
        const code = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);

        const token   = state.push('text_special', '', 0);
        token.content = isValidEntityCode(code) ? fromCodePoint(code) : fromCodePoint(0xFFFD);
        token.markup  = match[0];
        token.info    = 'entity';
      }
      state.pos += match[0].length;
      return true
    }
  } else {
    const match = state.src.slice(pos).match(NAMED_RE);
    if (match) {
      const decoded = decodeHTMLStrict(match[0]);
      if (decoded !== match[0]) {
        if (!silent) {
          const token   = state.push('text_special', '', 0);
          token.content = decoded;
          token.markup  = match[0];
          token.info    = 'entity';
        }
        state.pos += match[0].length;
        return true
      }
    }
  }

  return false
}

// For each opening emphasis-like marker find a matching closing one
//

function processDelimiters (delimiters) {
  const openersBottom = {};
  const max = delimiters.length;

  if (!max) return

  // headerIdx is the first delimiter of the current (where closer is) delimiter run
  let headerIdx = 0;
  let lastTokenIdx = -2; // needs any value lower than -1
  const jumps = [];

  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];

    jumps.push(0);

    // markers belong to same delimiter run if:
    //  - they have adjacent tokens
    //  - AND markers are the same
    //
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
      headerIdx = closerIdx;
    }

    lastTokenIdx = closer.token;

    // Length is only used for emphasis-specific "rule of 3",
    // if it's not defined (in strikethrough or 3rd party plugins),
    // we can default it to 0 to disable those checks.
    //
    closer.length = closer.length || 0;

    if (!closer.close) continue

    // Previously calculated lower bounds (previous fails)
    // for each marker, each delimiter length modulo 3,
    // and for whether this closer can be an opener;
    // https://github.com/commonmark/cmark/commit/34250e12ccebdc6372b8b49c44fab57c72443460
    /* eslint-disable-next-line no-prototype-builtins */
    if (!openersBottom.hasOwnProperty(closer.marker)) {
      openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
    }

    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length % 3)];

    let openerIdx = headerIdx - jumps[headerIdx] - 1;

    let newMinOpenerIdx = openerIdx;

    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];

      if (opener.marker !== closer.marker) continue

      if (opener.open && opener.end < 0) {
        let isOddMatch = false;

        // from spec:
        //
        // If one of the delimiters can both open and close emphasis, then the
        // sum of the lengths of the delimiter runs containing the opening and
        // closing delimiters must not be a multiple of 3 unless both lengths
        // are multiples of 3.
        //
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
              isOddMatch = true;
            }
          }
        }

        if (!isOddMatch) {
          // If previous delimiter cannot be an opener, we can safely skip
          // the entire sequence in future checks. This is required to make
          // sure algorithm has linear complexity (see *_*_*_*_*_... case).
          //
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open
            ? jumps[openerIdx - 1] + 1
            : 0;

          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;

          closer.open  = false;
          opener.end   = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          // treat next token as start of run,
          // it optimizes skips in **<...>**a**<...>** pathological case
          lastTokenIdx = -2;
          break
        }
      }
    }

    if (newMinOpenerIdx !== -1) {
      // If match for this delimiter run failed, we want to set lower bound for
      // future lookups. This is required to make sure algorithm has linear
      // complexity.
      //
      // See details here:
      // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
      //
      openersBottom[closer.marker][(closer.open ? 3 : 0) + ((closer.length || 0) % 3)] = newMinOpenerIdx;
    }
  }
}

function link_pairs (state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;

  processDelimiters(state.delimiters);

  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      processDelimiters(tokens_meta[curr].delimiters);
    }
  }
}

// Clean up tokens after emphasis and strikethrough postprocessing:
// merge adjacent text nodes into one and re-calculate all token levels
//
// This is necessary because initially emphasis delimiter markers (*, _, ~)
// are treated as their own separate text tokens. Then emphasis rule either
// leaves them as text (needed to merge with adjacent text) or turns them
// into opening/closing tags (which messes up levels inside).
//

function fragments_join (state) {
  let curr, last;
  let level = 0;
  const tokens = state.tokens;
  const max = state.tokens.length;

  for (curr = last = 0; curr < max; curr++) {
    // re-calculate levels after emphasis/strikethrough turns some text nodes
    // into opening/closing tags
    if (tokens[curr].nesting < 0) level--; // closing tag
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++; // opening tag

    if (tokens[curr].type === 'text' &&
        curr + 1 < max &&
        tokens[curr + 1].type === 'text') {
      // collapse two adjacent text nodes
      tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    } else {
      if (curr !== last) { tokens[last] = tokens[curr]; }

      last++;
    }
  }

  if (curr !== last) {
    tokens.length = last;
  }
}

/** internal
 * class ParserInline
 *
 * Tokenizes paragraph content.
 **/


// Parser rules

const _rules = [
  ['text',            text],
  ['linkify',         linkify],
  ['newline',         newline],
  ['escape',          escape],
  ['backticks',       backtick],
  ['strikethrough',   r_strikethrough.tokenize],
  ['emphasis',        r_emphasis.tokenize],
  ['link',            link],
  ['image',           image],
  ['autolink',        autolink],
  ['html_inline',     html_inline],
  ['entity',          entity]
];

// `rule2` ruleset was created specifically for emphasis/strikethrough
// post-processing and may be changed in the future.
//
// Don't use this for anything except pairs (plugins working with `balance_pairs`).
//
const _rules2 = [
  ['balance_pairs',   link_pairs],
  ['strikethrough',   r_strikethrough.postProcess],
  ['emphasis',        r_emphasis.postProcess],
  // rules for pairs separate '**' into its own text tokens, which may be left unused,
  // rule below merges unused segments back with the rest of the text
  ['fragments_join',  fragments_join]
];

/**
 * new ParserInline()
 **/
function ParserInline () {
  /**
   * ParserInline#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of inline rules.
   **/
  this.ruler = new Ruler();

  for (let i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }

  /**
   * ParserInline#ruler2 -> Ruler
   *
   * [[Ruler]] instance. Second ruler used for post-processing
   * (e.g. in emphasis-like rules).
   **/
  this.ruler2 = new Ruler();

  for (let i = 0; i < _rules2.length; i++) {
    this.ruler2.push(_rules2[i][0], _rules2[i][1]);
  }
}

// Skip single token by running all rules in validation mode;
// returns `true` if any rule reported success
//
ParserInline.prototype.skipToken = function (state) {
  const pos = state.pos;
  const rules = this.ruler.getRules('');
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  const cache = state.cache;

  if (typeof cache[pos] !== 'undefined') {
    state.pos = cache[pos];
    return
  }

  let ok = false;

  if (state.level < maxNesting) {
    for (let i = 0; i < len; i++) {
      // Increment state.level and decrement it later to limit recursion.
      // It's harmless to do here, because no tokens are created. But ideally,
      // we'd need a separate private state variable for this purpose.
      //
      state.level++;
      ok = rules[i](state, true);
      state.level--;

      if (ok) {
        if (pos >= state.pos) { throw new Error("inline rule didn't increment state.pos") }
        break
      }
    }
  } else {
    // Too much nesting, just skip until the end of the paragraph.
    //
    // NOTE: this will cause links to behave incorrectly in the following case,
    //       when an amount of `[` is exactly equal to `maxNesting + 1`:
    //
    //       [[[[[[[[[[[[[[[[[[[[[foo]()
    //
    // TODO: remove this workaround when CM standard will allow nested links
    //       (we can replace it by preventing links from being parsed in
    //       validation mode)
    //
    state.pos = state.posMax;
  }

  if (!ok) { state.pos++; }
  cache[pos] = state.pos;
};

// Generate tokens for input range
//
ParserInline.prototype.tokenize = function (state) {
  const rules = this.ruler.getRules('');
  const len = rules.length;
  const end = state.posMax;
  const maxNesting = state.md.options.maxNesting;

  while (state.pos < end) {
    // Try all possible rules.
    // On success, rule should:
    //
    // - update `state.pos`
    // - update `state.tokens`
    // - return true
    const prevPos = state.pos;
    let ok = false;

    if (state.level < maxNesting) {
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) {
          if (prevPos >= state.pos) { throw new Error("inline rule didn't increment state.pos") }
          break
        }
      }
    }

    if (ok) {
      if (state.pos >= end) { break }
      continue
    }

    state.pending += state.src[state.pos++];
  }

  if (state.pending) {
    state.pushPending();
  }
};

/**
 * ParserInline.parse(str, md, env, outTokens)
 *
 * Process input string and push inline tokens into `outTokens`
 **/
ParserInline.prototype.parse = function (str, md, env, outTokens) {
  const state = new this.State(str, md, env, outTokens);

  this.tokenize(state);

  const rules = this.ruler2.getRules('');
  const len = rules.length;

  for (let i = 0; i < len; i++) {
    rules[i](state);
  }
};

ParserInline.prototype.State = StateInline;

function reFactory (opts) {
  const re = {};
  opts = opts || {};

  re.src_Any = Any.source;
  re.src_Cc = Cc.source;
  re.src_Z = Z.source;
  re.src_P = P.source;

  // \p{\Z\P\Cc\CF} (white spaces + control + format + punctuation)
  re.src_ZPCc = [re.src_Z, re.src_P, re.src_Cc].join('|');

  // \p{\Z\Cc} (white spaces + control)
  re.src_ZCc = [re.src_Z, re.src_Cc].join('|');

  // Experimental. List of chars, completely prohibited in links
  // because can separate it from other part of text
  const text_separators = '[><\uff5c]';

  // All possible word characters (everything without punctuation, spaces & controls)
  // Defined via punctuation & spaces to save space
  // Should be something like \p{\L\N\S\M} (\w but without `_`)
  re.src_pseudo_letter = '(?:(?!' + text_separators + '|' + re.src_ZPCc + ')' + re.src_Any + ')';
  // The same as abothe but without [0-9]
  // var src_pseudo_letter_non_d = '(?:(?![0-9]|' + src_ZPCc + ')' + src_Any + ')';

  re.src_ip4 =

    '(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';

  // Prohibit any of "@/[]()" in user/pass to avoid wrong domain fetch.
  re.src_auth = '(?:(?:(?!' + re.src_ZCc + '|[@/\\[\\]()]).)+@)?';

  re.src_port =

    '(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?';

  re.src_host_terminator =

    '(?=$|' + text_separators + '|' + re.src_ZPCc + ')' +
    '(?!' + (opts['---'] ? '-(?!--)|' : '-|') + '_|:\\d|\\.-|\\.(?!$|' + re.src_ZPCc + '))';

  re.src_path =

    '(?:' +
      '[/?#]' +
        '(?:' +
          '(?!' + re.src_ZCc + '|' + text_separators + '|[()[\\]{}.,"\'?!\\-;]).|' +
          '\\[(?:(?!' + re.src_ZCc + '|\\]).)*\\]|' +
          '\\((?:(?!' + re.src_ZCc + '|[)]).)*\\)|' +
          '\\{(?:(?!' + re.src_ZCc + '|[}]).)*\\}|' +
          '\\"(?:(?!' + re.src_ZCc + '|["]).)+\\"|' +
          "\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|" +

          // allow `I'm_king` if no pair found
          "\\'(?=" + re.src_pseudo_letter + '|[-])|' +

          // google has many dots in "google search" links (#66, #81).
          // github has ... in commit range links,
          // Restrict to
          // - english
          // - percent-encoded
          // - parts of file path
          // - params separator
          // until more examples found.
          '\\.{2,}[a-zA-Z0-9%/&]|' +

          '\\.(?!' + re.src_ZCc + '|[.]|$)|' +
          (opts['---']
            ? '\\-(?!--(?:[^-]|$))(?:-*)|' // `---` => long dash, terminate
            : '\\-+|'
          ) +
          // allow `,,,` in paths
          ',(?!' + re.src_ZCc + '|$)|' +

          // allow `;` if not followed by space-like char
          ';(?!' + re.src_ZCc + '|$)|' +

          // allow `!!!` in paths, but not at the end
          '\\!+(?!' + re.src_ZCc + '|[!]|$)|' +

          '\\?(?!' + re.src_ZCc + '|[?]|$)' +
        ')+' +
      '|\\/' +
    ')?';

  // Allow anything in markdown spec, forbid quote (") at the first position
  // because emails enclosed in quotes are far more common
  re.src_email_name =

    '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]*';

  re.src_xn =

    'xn--[a-z0-9\\-]{1,59}';

  // More to read about domain names
  // http://serverfault.com/questions/638260/

  re.src_domain_root =

    // Allow letters & digits (http://test1)
    '(?:' +
      re.src_xn +
      '|' +
      re.src_pseudo_letter + '{1,63}' +
    ')';

  re.src_domain =

    '(?:' +
      re.src_xn +
      '|' +
      '(?:' + re.src_pseudo_letter + ')' +
      '|' +
      '(?:' + re.src_pseudo_letter + '(?:-|' + re.src_pseudo_letter + '){0,61}' + re.src_pseudo_letter + ')' +
    ')';

  re.src_host =

    '(?:' +
    // Don't need IP check, because digits are already allowed in normal domain names
    //   src_ip4 +
    // '|' +
      '(?:(?:(?:' + re.src_domain + ')\\.)*' + re.src_domain/* _root */ + ')' +
    ')';

  re.tpl_host_fuzzy =

    '(?:' +
      re.src_ip4 +
    '|' +
      '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))' +
    ')';

  re.tpl_host_no_ip_fuzzy =

    '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))';

  re.src_host_strict =

    re.src_host + re.src_host_terminator;

  re.tpl_host_fuzzy_strict =

    re.tpl_host_fuzzy + re.src_host_terminator;

  re.src_host_port_strict =

    re.src_host + re.src_port + re.src_host_terminator;

  re.tpl_host_port_fuzzy_strict =

    re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;

  re.tpl_host_port_no_ip_fuzzy_strict =

    re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;

  //
  // Main rules
  //

  // Rude test fuzzy links by host, for quick deny
  re.tpl_host_fuzzy_test =

    'localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:' + re.src_ZPCc + '|>|$))';

  re.tpl_email_fuzzy =

      '(^|' + text_separators + '|"|\\(|' + re.src_ZCc + ')' +
      '(' + re.src_email_name + '@' + re.tpl_host_fuzzy_strict + ')';

  re.tpl_link_fuzzy =
      // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
      '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_fuzzy_strict + re.src_path + ')';

  re.tpl_link_no_ip_fuzzy =
      // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
      '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ')';

  return re
}

//
// Helpers
//

// Merge objects
//
function assign (obj /* from1, from2, from3, ... */) {
  const sources = Array.prototype.slice.call(arguments, 1);

  sources.forEach(function (source) {
    if (!source) { return }

    Object.keys(source).forEach(function (key) {
      obj[key] = source[key];
    });
  });

  return obj
}

function _class (obj) { return Object.prototype.toString.call(obj) }
function isString (obj) { return _class(obj) === '[object String]' }
function isObject (obj) { return _class(obj) === '[object Object]' }
function isRegExp (obj) { return _class(obj) === '[object RegExp]' }
function isFunction (obj) { return _class(obj) === '[object Function]' }

function escapeRE (str) { return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&') }

//

const defaultOptions = {
  fuzzyLink: true,
  fuzzyEmail: true,
  fuzzyIP: false
};

function isOptionsObj (obj) {
  return Object.keys(obj || {}).reduce(function (acc, k) {
    /* eslint-disable-next-line no-prototype-builtins */
    return acc || defaultOptions.hasOwnProperty(k)
  }, false)
}

const defaultSchemas = {
  'http:': {
    validate: function (text, pos, self) {
      const tail = text.slice(pos);

      if (!self.re.http) {
        // compile lazily, because "host"-containing variables can change on tlds update.
        self.re.http = new RegExp(
          '^\\/\\/' + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, 'i'
        );
      }
      if (self.re.http.test(tail)) {
        return tail.match(self.re.http)[0].length
      }
      return 0
    }
  },
  'https:': 'http:',
  'ftp:': 'http:',
  '//': {
    validate: function (text, pos, self) {
      const tail = text.slice(pos);

      if (!self.re.no_http) {
      // compile lazily, because "host"-containing variables can change on tlds update.
        self.re.no_http = new RegExp(
          '^' +
          self.re.src_auth +
          // Don't allow single-level domains, because of false positives like '//test'
          // with code comments
          '(?:localhost|(?:(?:' + self.re.src_domain + ')\\.)+' + self.re.src_domain_root + ')' +
          self.re.src_port +
          self.re.src_host_terminator +
          self.re.src_path,

          'i'
        );
      }

      if (self.re.no_http.test(tail)) {
        // should not be `://` & `///`, that protects from errors in protocol name
        if (pos >= 3 && text[pos - 3] === ':') { return 0 }
        if (pos >= 3 && text[pos - 3] === '/') { return 0 }
        return tail.match(self.re.no_http)[0].length
      }
      return 0
    }
  },
  'mailto:': {
    validate: function (text, pos, self) {
      const tail = text.slice(pos);

      if (!self.re.mailto) {
        self.re.mailto = new RegExp(
          '^' + self.re.src_email_name + '@' + self.re.src_host_strict, 'i'
        );
      }
      if (self.re.mailto.test(tail)) {
        return tail.match(self.re.mailto)[0].length
      }
      return 0
    }
  }
};

// RE pattern for 2-character tlds (autogenerated by ./support/tlds_2char_gen.js)
/* eslint-disable-next-line max-len */
const tlds_2ch_src_re = 'a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]';

// DON'T try to make PRs with changes. Extend TLDs with LinkifyIt.tlds() instead
const tlds_default = 'biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split('|');

function createValidator (re) {
  return function (text, pos) {
    const tail = text.slice(pos);

    if (re.test(tail)) {
      return tail.match(re)[0].length
    }
    return 0
  }
}

function createNormalizer () {
  return function (match, self) {
    self.normalize(match);
  }
}

// Schemas compiler. Build regexps.
//
function compile (self) {
  // Load & clone RE patterns.
  const re = self.re = reFactory(self.__opts__);

  // Define dynamic patterns
  const tlds = self.__tlds__.slice();

  self.onCompile();

  if (!self.__tlds_replaced__) {
    tlds.push(tlds_2ch_src_re);
  }
  tlds.push(re.src_xn);

  re.src_tlds = tlds.join('|');

  function untpl (tpl) { return tpl.replace('%TLDS%', re.src_tlds) }

  re.email_fuzzy = RegExp(untpl(re.tpl_email_fuzzy), 'i');
  re.email_fuzzy_global = RegExp(untpl(re.tpl_email_fuzzy), 'ig');
  re.link_fuzzy = RegExp(untpl(re.tpl_link_fuzzy), 'i');
  re.link_fuzzy_global = RegExp(untpl(re.tpl_link_fuzzy), 'ig');
  re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), 'i');
  re.link_no_ip_fuzzy_global = RegExp(untpl(re.tpl_link_no_ip_fuzzy), 'ig');
  re.host_fuzzy_test = RegExp(untpl(re.tpl_host_fuzzy_test), 'i');

  //
  // Compile each schema
  //

  const aliases = [];

  self.__compiled__ = {}; // Reset compiled data

  function schemaError (name, val) {
    throw new Error('(LinkifyIt) Invalid schema "' + name + '": ' + val)
  }

  Object.keys(self.__schemas__).forEach(function (name) {
    const val = self.__schemas__[name];

    // skip disabled methods
    if (val === null) { return }

    const compiled = { validate: null, link: null };

    self.__compiled__[name] = compiled;

    if (isObject(val)) {
      if (isRegExp(val.validate)) {
        compiled.validate = createValidator(val.validate);
      } else if (isFunction(val.validate)) {
        compiled.validate = val.validate;
      } else {
        schemaError(name, val);
      }

      if (isFunction(val.normalize)) {
        compiled.normalize = val.normalize;
      } else if (!val.normalize) {
        compiled.normalize = createNormalizer();
      } else {
        schemaError(name, val);
      }

      return
    }

    if (isString(val)) {
      aliases.push(name);
      return
    }

    schemaError(name, val);
  });

  //
  // Compile postponed aliases
  //

  aliases.forEach(function (alias) {
    if (!self.__compiled__[self.__schemas__[alias]]) {
      // Silently fail on missed schemas to avoid errons on disable.
      // schemaError(alias, self.__schemas__[alias]);
      return
    }

    self.__compiled__[alias].validate =
      self.__compiled__[self.__schemas__[alias]].validate;
    self.__compiled__[alias].normalize =
      self.__compiled__[self.__schemas__[alias]].normalize;
  });

  //
  // Fake record for guessed links
  //
  self.__compiled__[''] = { validate: null, normalize: createNormalizer() };

  //
  // Build schema condition
  //
  const slist = Object.keys(self.__compiled__)
    .filter(function (name) {
      // Filter disabled & fake schemas
      return name.length > 0 && self.__compiled__[name]
    })
    .map(escapeRE)
    .join('|');
  // (?!_) cause 1.5x slowdown
  self.re.schema_test = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'i');
  self.re.schema_search = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'ig');
  self.re.schema_at_start = RegExp('^' + self.re.schema_search.source, 'i');

  self.re.pretest = RegExp(
    '(' + self.re.schema_test.source + ')|(' + self.re.host_fuzzy_test.source + ')|@',
    'i'
  );
}

/**
 * class Match
 *
 * Match result. Single element of array, returned by [[LinkifyIt#match]]
 **/
function Match (text, schema, index, lastIndex) {
  const raw = text.slice(index, lastIndex);

  /**
   * Match#schema -> String
   *
   * Prefix (protocol) for matched string.
   **/
  this.schema = schema.toLowerCase();
  /**
   * Match#index -> Number
   *
   * First position of matched string.
   **/
  this.index = index;
  /**
   * Match#lastIndex -> Number
   *
   * Next position after matched string.
   **/
  this.lastIndex = lastIndex;
  /**
   * Match#raw -> String
   *
   * Matched string.
   **/
  this.raw = raw;
  /**
   * Match#text -> String
   *
   * Notmalized text of matched string.
   **/
  this.text = raw;
  /**
   * Match#url -> String
   *
   * Normalized url of matched string.
   **/
  this.url = raw;
}

/**
 * class LinkifyIt
 **/

/**
 * new LinkifyIt(schemas, options)
 * - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
 * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
 *
 * Creates new linkifier instance with optional additional schemas.
 * Can be called without `new` keyword for convenience.
 *
 * By default understands:
 *
 * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
 * - "fuzzy" links and emails (example.com, foo@bar.com).
 *
 * `schemas` is an object, where each key/value describes protocol/rule:
 *
 * - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
 *   for example). `linkify-it` makes shure that prefix is not preceeded with
 *   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
 * - __value__ - rule to check tail after link prefix
 *   - _String_ - just alias to existing rule
 *   - _Object_
 *     - _validate_ - validator function (should return matched length on success),
 *       or `RegExp`.
 *     - _normalize_ - optional function to normalize text & url of matched result
 *       (for example, for @twitter mentions).
 *
 * `options`:
 *
 * - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
 * - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
 *   like version numbers. Default `false`.
 * - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
 *
 **/
function LinkifyIt (schemas, options) {
  if (!(this instanceof LinkifyIt)) {
    return new LinkifyIt(schemas, options)
  }

  if (!options) {
    if (isOptionsObj(schemas)) {
      options = schemas;
      schemas = {};
    }
  }

  this.__opts__ = assign({}, defaultOptions, options);

  this.__schemas__ = assign({}, defaultSchemas, schemas);
  this.__compiled__ = {};

  this.__tlds__ = tlds_default;
  this.__tlds_replaced__ = false;

  this.re = {};

  compile(this);
}

/** chainable
 * LinkifyIt#add(schema, definition)
 * - schema (String): rule name (fixed pattern prefix)
 * - definition (String|RegExp|Object): schema definition
 *
 * Add new rule definition. See constructor description for details.
 **/
LinkifyIt.prototype.add = function add (schema, definition) {
  this.__schemas__[schema] = definition;
  compile(this);
  return this
};

/** chainable
 * LinkifyIt#set(options)
 * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
 *
 * Set recognition options for links without schema.
 **/
LinkifyIt.prototype.set = function set (options) {
  this.__opts__ = assign(this.__opts__, options);
  return this
};

/**
 * LinkifyIt#test(text) -> Boolean
 *
 * Searches linkifiable pattern and returns `true` on success or `false` on fail.
 **/
LinkifyIt.prototype.test = function test (text) {
  if (!text.length) { return false }

  let m, re;

  // try to scan for link with schema - that's the most simple rule
  if (this.re.schema_test.test(text)) {
    re = this.re.schema_search;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (this.testSchemaAt(text, m[2], re.lastIndex)) { return true }
    }
  }

  if (this.__opts__.fuzzyLink && this.__compiled__['http:']) {
    // guess schemaless links
    if (text.search(this.re.host_fuzzy_test) >= 0) {
      if (text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy) !== null) {
        return true
      }
    }
  }

  if (this.__opts__.fuzzyEmail && this.__compiled__['mailto:']) {
    // guess schemaless emails
    if (text.indexOf('@') >= 0) {
      // We can't skip this check, because this cases are possible:
      // 192.168.1.1@gmail.com, my.in@example.com
      if (text.match(this.re.email_fuzzy) !== null) { return true }
    }
  }

  return false
};

/**
 * LinkifyIt#pretest(text) -> Boolean
 *
 * Very quick check, that can give false positives. Returns true if link MAY BE
 * can exists. Can be used for speed optimization, when you need to check that
 * link NOT exists.
 **/
LinkifyIt.prototype.pretest = function pretest (text) {
  return this.re.pretest.test(text)
};

/**
 * LinkifyIt#testSchemaAt(text, name, position) -> Number
 * - text (String): text to scan
 * - name (String): rule (schema) name
 * - position (Number): text offset to check from
 *
 * Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
 * at given position. Returns length of found pattern (0 on fail).
 **/
LinkifyIt.prototype.testSchemaAt = function testSchemaAt (text, schema, pos) {
  // If not supported schema check requested - terminate
  if (!this.__compiled__[schema.toLowerCase()]) {
    return 0
  }
  return this.__compiled__[schema.toLowerCase()].validate(text, pos, this)
};

/**
 * LinkifyIt#match(text) -> Array|null
 *
 * Returns array of found link descriptions or `null` on fail. We strongly
 * recommend to use [[LinkifyIt#test]] first, for best speed.
 *
 * ##### Result match description
 *
 * - __schema__ - link schema, can be empty for fuzzy links, or `//` for
 *   protocol-neutral  links.
 * - __index__ - offset of matched text
 * - __lastIndex__ - index of next char after mathch end
 * - __raw__ - matched text
 * - __text__ - normalized text
 * - __url__ - link, generated from matched text
 **/
LinkifyIt.prototype.match = function match (text) {
  const result = [];
  const type_schemed = [];
  const type_fuzzy_link = [];
  const type_fuzzy_email = [];
  let m, len, re;

  function choose (a, b) {
    if (!a) { return b }
    if (!b) { return a }
    if (a.index !== b.index) { return a.index < b.index ? a : b }
    return a.lastIndex >= b.lastIndex ? a : b
  }

  if (!text.length) { return null }

  // scan for links with schema
  if (this.re.schema_test.test(text)) {
    re = this.re.schema_search;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      len = this.testSchemaAt(text, m[2], re.lastIndex);
      if (len) {
        type_schemed.push({
          schema: m[2],
          index: m.index + m[1].length,
          lastIndex: m.index + m[0].length + len
        });
      }
    }
  }

  if (this.__opts__.fuzzyLink && this.__compiled__['http:']) {
    re = this.__opts__.fuzzyIP ? this.re.link_fuzzy_global : this.re.link_no_ip_fuzzy_global;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      type_fuzzy_link.push({
        schema: '',
        index: m.index + m[1].length,
        lastIndex: m.index + m[0].length
      });
    }
  }

  if (this.__opts__.fuzzyEmail && this.__compiled__['mailto:']) {
    re = this.re.email_fuzzy_global;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      type_fuzzy_email.push({
        schema: 'mailto:',
        index: m.index + m[1].length,
        lastIndex: m.index + m[0].length
      });
    }
  }

  const indexes = [0, 0, 0];
  let lastIndex = 0;

  for (;;) {
    const candidates = [
      type_schemed[indexes[0]],
      type_fuzzy_email[indexes[1]],
      type_fuzzy_link[indexes[2]]
    ];

    const candidate = choose(choose(candidates[0], candidates[1]), candidates[2]);

    if (!candidate) { break }

    if (candidate === candidates[0]) {
      indexes[0]++;
    } else if (candidate === candidates[1]) {
      indexes[1]++;
    } else {
      indexes[2]++;
    }

    if (candidate.index < lastIndex) { continue }

    const match = new Match(text, candidate.schema, candidate.index, candidate.lastIndex);
    this.__compiled__[match.schema].normalize(match, this);
    result.push(match);
    lastIndex = candidate.lastIndex;
  }

  if (result.length) {
    return result
  }

  return null
};

/**
 * LinkifyIt#matchAtStart(text) -> Match|null
 *
 * Returns fully-formed (not fuzzy) link if it starts at the beginning
 * of the string, and null otherwise.
 **/
LinkifyIt.prototype.matchAtStart = function matchAtStart (text) {
  if (!text.length) return null

  const m = this.re.schema_at_start.exec(text);
  if (!m) return null

  const len = this.testSchemaAt(text, m[2], m[0].length);
  if (!len) return null

  const match = new Match(text, m[2], m.index + m[1].length, m.index + m[0].length + len);

  this.__compiled__[match.schema].normalize(match, this);
  return match
};

/** chainable
 * LinkifyIt#tlds(list [, keepOld]) -> this
 * - list (Array): list of tlds
 * - keepOld (Boolean): merge with current list if `true` (`false` by default)
 *
 * Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
 * to avoid false positives. By default this algorythm used:
 *
 * - hostname with any 2-letter root zones are ok.
 * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
 *   are ok.
 * - encoded (`xn--...`) root zones are ok.
 *
 * If list is replaced, then exact match for 2-chars root zones will be checked.
 **/
LinkifyIt.prototype.tlds = function tlds (list, keepOld) {
  list = Array.isArray(list) ? list : [list];

  if (!keepOld) {
    this.__tlds__ = list.slice();
    this.__tlds_replaced__ = true;
    compile(this);
    return this
  }

  this.__tlds__ = this.__tlds__.concat(list)
    .sort()
    .filter(function (el, idx, arr) {
      return el !== arr[idx - 1]
    })
    .reverse();

  compile(this);
  return this
};

/**
 * LinkifyIt#normalize(match)
 *
 * Default normalizer (if schema does not define it's own).
 **/
LinkifyIt.prototype.normalize = function normalize (match) {
  // Do minimal possible changes by default. Need to collect feedback prior
  // to move forward https://github.com/markdown-it/linkify-it/issues/1

  if (!match.schema) { match.url = 'http://' + match.url; }

  if (match.schema === 'mailto:' && !/^mailto:/i.test(match.url)) {
    match.url = 'mailto:' + match.url;
  }
};

/**
 * LinkifyIt#onCompile()
 *
 * Override to modify basic RegExp-s.
 **/
LinkifyIt.prototype.onCompile = function onCompile () {
};

/** Highest positive signed 32-bit float value */
const maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
const base$1 = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = '-'; // '\x2D'

/** Regular expressions */
const regexPunycode = /^xn--/;
const regexNonASCII = /[^\0-\x7F]/; // Note: U+007F DEL is excluded too.
const regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

/** Error messages */
const errors = {
	'overflow': 'Overflow: input needs wider integers to process',
	'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
	'invalid-input': 'Invalid input'
};

/** Convenience shortcuts */
const baseMinusTMin = base$1 - tMin;
const floor = Math.floor;
const stringFromCharCode = String.fromCharCode;

/*--------------------------------------------------------------------------*/

/**
 * A generic error utility function.
 * @private
 * @param {String} type The error type.
 * @returns {Error} Throws a `RangeError` with the applicable error message.
 */
function error(type) {
	throw new RangeError(errors[type]);
}

/**
 * A generic `Array#map` utility function.
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} callback The function that gets called for every array
 * item.
 * @returns {Array} A new array of values returned by the callback function.
 */
function map(array, callback) {
	const result = [];
	let length = array.length;
	while (length--) {
		result[length] = callback(array[length]);
	}
	return result;
}

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email
 * addresses.
 * @private
 * @param {String} domain The domain name or email address.
 * @param {Function} callback The function that gets called for every
 * character.
 * @returns {String} A new string of characters returned by the callback
 * function.
 */
function mapDomain(domain, callback) {
	const parts = domain.split('@');
	let result = '';
	if (parts.length > 1) {
		// In email addresses, only the domain name should be punycoded. Leave
		// the local part (i.e. everything up to `@`) intact.
		result = parts[0] + '@';
		domain = parts[1];
	}
	// Avoid `split(regex)` for IE8 compatibility. See #17.
	domain = domain.replace(regexSeparators, '\x2E');
	const labels = domain.split('.');
	const encoded = map(labels, callback).join('.');
	return result + encoded;
}

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 * @see `punycode.ucs2.encode`
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode.ucs2
 * @name decode
 * @param {String} string The Unicode input string (UCS-2).
 * @returns {Array} The new array of code points.
 */
function ucs2decode(string) {
	const output = [];
	let counter = 0;
	const length = string.length;
	while (counter < length) {
		const value = string.charCodeAt(counter++);
		if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
			// It's a high surrogate, and there is a next character.
			const extra = string.charCodeAt(counter++);
			if ((extra & 0xFC00) == 0xDC00) { // Low surrogate.
				output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
			} else {
				// It's an unmatched surrogate; only append this code unit, in case the
				// next code unit is the high surrogate of a surrogate pair.
				output.push(value);
				counter--;
			}
		} else {
			output.push(value);
		}
	}
	return output;
}

/**
 * Creates a string based on an array of numeric code points.
 * @see `punycode.ucs2.decode`
 * @memberOf punycode.ucs2
 * @name encode
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */
const ucs2encode = codePoints => String.fromCodePoint(...codePoints);

/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
const basicToDigit = function(codePoint) {
	if (codePoint >= 0x30 && codePoint < 0x3A) {
		return 26 + (codePoint - 0x30);
	}
	if (codePoint >= 0x41 && codePoint < 0x5B) {
		return codePoint - 0x41;
	}
	if (codePoint >= 0x61 && codePoint < 0x7B) {
		return codePoint - 0x61;
	}
	return base$1;
};

/**
 * Converts a digit/integer into a basic code point.
 * @see `basicToDigit()`
 * @private
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
const digitToBasic = function(digit, flag) {
	//  0..25 map to ASCII a..z or A..Z
	// 26..35 map to ASCII 0..9
	return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 * @private
 */
const adapt = function(delta, numPoints, firstTime) {
	let k = 0;
	delta = firstTime ? floor(delta / damp) : delta >> 1;
	delta += floor(delta / numPoints);
	for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base$1) {
		delta = floor(delta / baseMinusTMin);
	}
	return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */
const decode = function(input) {
	// Don't use UCS-2.
	const output = [];
	const inputLength = input.length;
	let i = 0;
	let n = initialN;
	let bias = initialBias;

	// Handle the basic code points: let `basic` be the number of input code
	// points before the last delimiter, or `0` if there is none, then copy
	// the first basic code points to the output.

	let basic = input.lastIndexOf(delimiter);
	if (basic < 0) {
		basic = 0;
	}

	for (let j = 0; j < basic; ++j) {
		// if it's not a basic code point
		if (input.charCodeAt(j) >= 0x80) {
			error('not-basic');
		}
		output.push(input.charCodeAt(j));
	}

	// Main decoding loop: start just after the last delimiter if any basic code
	// points were copied; start at the beginning otherwise.

	for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

		// `index` is the index of the next character to be consumed.
		// Decode a generalized variable-length integer into `delta`,
		// which gets added to `i`. The overflow checking is easier
		// if we increase `i` as we go, then subtract off its starting
		// value at the end to obtain `delta`.
		const oldi = i;
		for (let w = 1, k = base$1; /* no condition */; k += base$1) {

			if (index >= inputLength) {
				error('invalid-input');
			}

			const digit = basicToDigit(input.charCodeAt(index++));

			if (digit >= base$1) {
				error('invalid-input');
			}
			if (digit > floor((maxInt - i) / w)) {
				error('overflow');
			}

			i += digit * w;
			const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

			if (digit < t) {
				break;
			}

			const baseMinusT = base$1 - t;
			if (w > floor(maxInt / baseMinusT)) {
				error('overflow');
			}

			w *= baseMinusT;

		}

		const out = output.length + 1;
		bias = adapt(i - oldi, out, oldi == 0);

		// `i` was supposed to wrap around from `out` to `0`,
		// incrementing `n` each time, so we'll fix that now:
		if (floor(i / out) > maxInt - n) {
			error('overflow');
		}

		n += floor(i / out);
		i %= out;

		// Insert `n` at position `i` of the output.
		output.splice(i++, 0, n);

	}

	return String.fromCodePoint(...output);
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 * @memberOf punycode
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
const encode = function(input) {
	const output = [];

	// Convert the input in UCS-2 to an array of Unicode code points.
	input = ucs2decode(input);

	// Cache the length.
	const inputLength = input.length;

	// Initialize the state.
	let n = initialN;
	let delta = 0;
	let bias = initialBias;

	// Handle the basic code points.
	for (const currentValue of input) {
		if (currentValue < 0x80) {
			output.push(stringFromCharCode(currentValue));
		}
	}

	const basicLength = output.length;
	let handledCPCount = basicLength;

	// `handledCPCount` is the number of code points that have been handled;
	// `basicLength` is the number of basic code points.

	// Finish the basic string with a delimiter unless it's empty.
	if (basicLength) {
		output.push(delimiter);
	}

	// Main encoding loop:
	while (handledCPCount < inputLength) {

		// All non-basic code points < n have been handled already. Find the next
		// larger one:
		let m = maxInt;
		for (const currentValue of input) {
			if (currentValue >= n && currentValue < m) {
				m = currentValue;
			}
		}

		// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
		// but guard against overflow.
		const handledCPCountPlusOne = handledCPCount + 1;
		if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
			error('overflow');
		}

		delta += (m - n) * handledCPCountPlusOne;
		n = m;

		for (const currentValue of input) {
			if (currentValue < n && ++delta > maxInt) {
				error('overflow');
			}
			if (currentValue === n) {
				// Represent delta as a generalized variable-length integer.
				let q = delta;
				for (let k = base$1; /* no condition */; k += base$1) {
					const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
					if (q < t) {
						break;
					}
					const qMinusT = q - t;
					const baseMinusT = base$1 - t;
					output.push(
						stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
					);
					q = floor(qMinusT / baseMinusT);
				}

				output.push(stringFromCharCode(digitToBasic(q, 0)));
				bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
				delta = 0;
				++handledCPCount;
			}
		}

		++delta;
		++n;

	}
	return output.join('');
};

/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 * @memberOf punycode
 * @param {String} input The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode
 * string.
 */
const toUnicode = function(input) {
	return mapDomain(input, function(string) {
		return regexPunycode.test(string)
			? decode(string.slice(4).toLowerCase())
			: string;
	});
};

/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 * @memberOf punycode
 * @param {String} input The domain name or email address to convert, as a
 * Unicode string.
 * @returns {String} The Punycode representation of the given domain name or
 * email address.
 */
const toASCII = function(input) {
	return mapDomain(input, function(string) {
		return regexNonASCII.test(string)
			? 'xn--' + encode(string)
			: string;
	});
};

/*--------------------------------------------------------------------------*/

/** Define the public API */
const punycode = {
	/**
	 * A string representing the current Punycode.js version number.
	 * @memberOf punycode
	 * @type String
	 */
	'version': '2.3.1',
	/**
	 * An object of methods to convert from JavaScript's internal character
	 * representation (UCS-2) to Unicode code points, and back.
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode
	 * @type Object
	 */
	'ucs2': {
		'decode': ucs2decode,
		'encode': ucs2encode
	},
	'decode': decode,
	'encode': encode,
	'toASCII': toASCII,
	'toUnicode': toUnicode
};

// markdown-it default options

var cfg_default = {
  options: {
    // Enable HTML tags in source
    html: false,

    // Use '/' to close single tags (<br />)
    xhtmlOut: false,

    // Convert '\n' in paragraphs into <br>
    breaks: false,

    // CSS language prefix for fenced blocks
    langPrefix: 'language-',

    // autoconvert URL-like texts to links
    linkify: false,

    // Enable some language-neutral replacements + quotes beautification
    typographer: false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    // Internal protection, recursion limit
    maxNesting: 100
  },

  components: {
    core: {},
    block: {},
    inline: {}
  }
};

// "Zero" preset, with nothing enabled. Useful for manual configuring of simple
// modes. For example, to parse bold/italic only.

var cfg_zero = {
  options: {
    // Enable HTML tags in source
    html: false,

    // Use '/' to close single tags (<br />)
    xhtmlOut: false,

    // Convert '\n' in paragraphs into <br>
    breaks: false,

    // CSS language prefix for fenced blocks
    langPrefix: 'language-',

    // autoconvert URL-like texts to links
    linkify: false,

    // Enable some language-neutral replacements + quotes beautification
    typographer: false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    // Internal protection, recursion limit
    maxNesting: 20
  },

  components: {

    core: {
      rules: [
        'normalize',
        'block',
        'inline',
        'text_join'
      ]
    },

    block: {
      rules: [
        'paragraph'
      ]
    },

    inline: {
      rules: [
        'text'
      ],
      rules2: [
        'balance_pairs',
        'fragments_join'
      ]
    }
  }
};

// Commonmark default options

var cfg_commonmark = {
  options: {
    // Enable HTML tags in source
    html: true,

    // Use '/' to close single tags (<br />)
    xhtmlOut: true,

    // Convert '\n' in paragraphs into <br>
    breaks: false,

    // CSS language prefix for fenced blocks
    langPrefix: 'language-',

    // autoconvert URL-like texts to links
    linkify: false,

    // Enable some language-neutral replacements + quotes beautification
    typographer: false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    // Internal protection, recursion limit
    maxNesting: 20
  },

  components: {

    core: {
      rules: [
        'normalize',
        'block',
        'inline',
        'text_join'
      ]
    },

    block: {
      rules: [
        'blockquote',
        'code',
        'fence',
        'heading',
        'hr',
        'html_block',
        'lheading',
        'list',
        'reference',
        'paragraph'
      ]
    },

    inline: {
      rules: [
        'autolink',
        'backticks',
        'emphasis',
        'entity',
        'escape',
        'html_inline',
        'image',
        'link',
        'newline',
        'text'
      ],
      rules2: [
        'balance_pairs',
        'emphasis',
        'fragments_join'
      ]
    }
  }
};

// Main parser class


const config = {
  default: cfg_default,
  zero: cfg_zero,
  commonmark: cfg_commonmark
};

//
// This validator can prohibit more than really needed to prevent XSS. It's a
// tradeoff to keep code simple and to be secure by default.
//
// If you need different setup - override validator method as you wish. Or
// replace it with dummy function and use external sanitizer.
//

const BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;

function validateLink (url) {
  // url should be normalized at this point, and existing entities are decoded
  const str = url.trim().toLowerCase();

  return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true
}

const RECODE_HOSTNAME_FOR = ['http:', 'https:', 'mailto:'];

function normalizeLink (url) {
  const parsed = urlParse(url, true);

  if (parsed.hostname) {
    // Encode hostnames in urls like:
    // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
    //
    // We don't encode unknown schemas, because it's likely that we encode
    // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
    //
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode.toASCII(parsed.hostname);
      } catch (er) { /**/ }
    }
  }

  return encode$1(format(parsed))
}

function normalizeLinkText (url) {
  const parsed = urlParse(url, true);

  if (parsed.hostname) {
    // Encode hostnames in urls like:
    // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
    //
    // We don't encode unknown schemas, because it's likely that we encode
    // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
    //
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode.toUnicode(parsed.hostname);
      } catch (er) { /**/ }
    }
  }

  // add '%' to exclude list because of https://github.com/markdown-it/markdown-it/issues/720
  return decode$1(format(parsed), decode$1.defaultChars + '%')
}

/**
 * class MarkdownIt
 *
 * Main parser/renderer class.
 *
 * ##### Usage
 *
 * ```javascript
 * // node.js, "classic" way:
 * var MarkdownIt = require('markdown-it'),
 *     md = new MarkdownIt();
 * var result = md.render('# markdown-it rulezz!');
 *
 * // node.js, the same, but with sugar:
 * var md = require('markdown-it')();
 * var result = md.render('# markdown-it rulezz!');
 *
 * // browser without AMD, added to "window" on script load
 * // Note, there are no dash.
 * var md = window.markdownit();
 * var result = md.render('# markdown-it rulezz!');
 * ```
 *
 * Single line rendering, without paragraph wrap:
 *
 * ```javascript
 * var md = require('markdown-it')();
 * var result = md.renderInline('__markdown-it__ rulezz!');
 * ```
 **/

/**
 * new MarkdownIt([presetName, options])
 * - presetName (String): optional, `commonmark` / `zero`
 * - options (Object)
 *
 * Creates parser instanse with given config. Can be called without `new`.
 *
 * ##### presetName
 *
 * MarkdownIt provides named presets as a convenience to quickly
 * enable/disable active syntax rules and options for common use cases.
 *
 * - ["commonmark"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/commonmark.mjs) -
 *   configures parser to strict [CommonMark](http://commonmark.org/) mode.
 * - [default](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/default.mjs) -
 *   similar to GFM, used when no preset name given. Enables all available rules,
 *   but still without html, typographer & autolinker.
 * - ["zero"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/zero.mjs) -
 *   all rules disabled. Useful to quickly setup your config via `.enable()`.
 *   For example, when you need only `bold` and `italic` markup and nothing else.
 *
 * ##### options:
 *
 * - __html__ - `false`. Set `true` to enable HTML tags in source. Be careful!
 *   That's not safe! You may need external sanitizer to protect output from XSS.
 *   It's better to extend features via plugins, instead of enabling HTML.
 * - __xhtmlOut__ - `false`. Set `true` to add '/' when closing single tags
 *   (`<br />`). This is needed only for full CommonMark compatibility. In real
 *   world you will need HTML output.
 * - __breaks__ - `false`. Set `true` to convert `\n` in paragraphs into `<br>`.
 * - __langPrefix__ - `language-`. CSS language class prefix for fenced blocks.
 *   Can be useful for external highlighters.
 * - __linkify__ - `false`. Set `true` to autoconvert URL-like text to links.
 * - __typographer__  - `false`. Set `true` to enable [some language-neutral
 *   replacement](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.mjs) +
 *   quotes beautification (smartquotes).
 * - __quotes__ - `“”‘’`, String or Array. Double + single quotes replacement
 *   pairs, when typographer enabled and smartquotes on. For example, you can
 *   use `'«»„“'` for Russian, `'„“‚‘'` for German, and
 *   `['«\xA0', '\xA0»', '‹\xA0', '\xA0›']` for French (including nbsp).
 * - __highlight__ - `null`. Highlighter function for fenced code blocks.
 *   Highlighter `function (str, lang)` should return escaped HTML. It can also
 *   return empty string if the source was not changed and should be escaped
 *   externaly. If result starts with <pre... internal wrapper is skipped.
 *
 * ##### Example
 *
 * ```javascript
 * // commonmark mode
 * var md = require('markdown-it')('commonmark');
 *
 * // default mode
 * var md = require('markdown-it')();
 *
 * // enable everything
 * var md = require('markdown-it')({
 *   html: true,
 *   linkify: true,
 *   typographer: true
 * });
 * ```
 *
 * ##### Syntax highlighting
 *
 * ```js
 * var hljs = require('highlight.js') // https://highlightjs.org/
 *
 * var md = require('markdown-it')({
 *   highlight: function (str, lang) {
 *     if (lang && hljs.getLanguage(lang)) {
 *       try {
 *         return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
 *       } catch (__) {}
 *     }
 *
 *     return ''; // use external default escaping
 *   }
 * });
 * ```
 *
 * Or with full wrapper override (if you need assign class to `<pre>` or `<code>`):
 *
 * ```javascript
 * var hljs = require('highlight.js') // https://highlightjs.org/
 *
 * // Actual default values
 * var md = require('markdown-it')({
 *   highlight: function (str, lang) {
 *     if (lang && hljs.getLanguage(lang)) {
 *       try {
 *         return '<pre><code class="hljs">' +
 *                hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
 *                '</code></pre>';
 *       } catch (__) {}
 *     }
 *
 *     return '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
 *   }
 * });
 * ```
 *
 **/
function MarkdownIt (presetName, options) {
  if (!(this instanceof MarkdownIt)) {
    return new MarkdownIt(presetName, options)
  }

  if (!options) {
    if (!isString$1(presetName)) {
      options = presetName || {};
      presetName = 'default';
    }
  }

  /**
   * MarkdownIt#inline -> ParserInline
   *
   * Instance of [[ParserInline]]. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.inline = new ParserInline();

  /**
   * MarkdownIt#block -> ParserBlock
   *
   * Instance of [[ParserBlock]]. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.block = new ParserBlock();

  /**
   * MarkdownIt#core -> Core
   *
   * Instance of [[Core]] chain executor. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.core = new Core();

  /**
   * MarkdownIt#renderer -> Renderer
   *
   * Instance of [[Renderer]]. Use it to modify output look. Or to add rendering
   * rules for new token types, generated by plugins.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * function myToken(tokens, idx, options, env, self) {
   *   //...
   *   return result;
   * };
   *
   * md.renderer.rules['my_token'] = myToken
   * ```
   *
   * See [[Renderer]] docs and [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.mjs).
   **/
  this.renderer = new Renderer();

  /**
   * MarkdownIt#linkify -> LinkifyIt
   *
   * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
   * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/linkify.mjs)
   * rule.
   **/
  this.linkify = new LinkifyIt();

  /**
   * MarkdownIt#validateLink(url) -> Boolean
   *
   * Link validation function. CommonMark allows too much in links. By default
   * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
   * except some embedded image types.
   *
   * You can change this behaviour:
   *
   * ```javascript
   * var md = require('markdown-it')();
   * // enable everything
   * md.validateLink = function () { return true; }
   * ```
   **/
  this.validateLink = validateLink;

  /**
   * MarkdownIt#normalizeLink(url) -> String
   *
   * Function used to encode link url to a machine-readable format,
   * which includes url-encoding, punycode, etc.
   **/
  this.normalizeLink = normalizeLink;

  /**
   * MarkdownIt#normalizeLinkText(url) -> String
   *
   * Function used to decode link url to a human-readable format`
   **/
  this.normalizeLinkText = normalizeLinkText;

  // Expose utils & helpers for easy acces from plugins

  /**
   * MarkdownIt#utils -> utils
   *
   * Assorted utility functions, useful to write plugins. See details
   * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/common/utils.mjs).
   **/
  this.utils = utils;

  /**
   * MarkdownIt#helpers -> helpers
   *
   * Link components parser functions, useful to write plugins. See details
   * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/helpers).
   **/
  this.helpers = assign$1({}, helpers);

  this.options = {};
  this.configure(presetName);

  if (options) { this.set(options); }
}

/** chainable
 * MarkdownIt.set(options)
 *
 * Set parser options (in the same format as in constructor). Probably, you
 * will never need it, but you can change options after constructor call.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')()
 *             .set({ html: true, breaks: true })
 *             .set({ typographer: true });
 * ```
 *
 * __Note:__ To achieve the best possible performance, don't modify a
 * `markdown-it` instance options on the fly. If you need multiple configurations
 * it's best to create multiple instances and initialize each with separate
 * config.
 **/
MarkdownIt.prototype.set = function (options) {
  assign$1(this.options, options);
  return this
};

/** chainable, internal
 * MarkdownIt.configure(presets)
 *
 * Batch load of all options and compenent settings. This is internal method,
 * and you probably will not need it. But if you will - see available presets
 * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/lib/presets)
 *
 * We strongly recommend to use presets instead of direct config loads. That
 * will give better compatibility with next versions.
 **/
MarkdownIt.prototype.configure = function (presets) {
  const self = this;

  if (isString$1(presets)) {
    const presetName = presets;
    presets = config[presetName];
    if (!presets) { throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name') }
  }

  if (!presets) { throw new Error('Wrong `markdown-it` preset, can\'t be empty') }

  if (presets.options) { self.set(presets.options); }

  if (presets.components) {
    Object.keys(presets.components).forEach(function (name) {
      if (presets.components[name].rules) {
        self[name].ruler.enableOnly(presets.components[name].rules);
      }
      if (presets.components[name].rules2) {
        self[name].ruler2.enableOnly(presets.components[name].rules2);
      }
    });
  }
  return this
};

/** chainable
 * MarkdownIt.enable(list, ignoreInvalid)
 * - list (String|Array): rule name or list of rule names to enable
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable list or rules. It will automatically find appropriate components,
 * containing rules with given names. If rule not found, and `ignoreInvalid`
 * not set - throws exception.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')()
 *             .enable(['sub', 'sup'])
 *             .disable('smartquotes');
 * ```
 **/
MarkdownIt.prototype.enable = function (list, ignoreInvalid) {
  let result = [];

  if (!Array.isArray(list)) { list = [list]; }

  ['core', 'block', 'inline'].forEach(function (chain) {
    result = result.concat(this[chain].ruler.enable(list, true));
  }, this);

  result = result.concat(this.inline.ruler2.enable(list, true));

  const missed = list.filter(function (name) { return result.indexOf(name) < 0 });

  if (missed.length && !ignoreInvalid) {
    throw new Error('MarkdownIt. Failed to enable unknown rule(s): ' + missed)
  }

  return this
};

/** chainable
 * MarkdownIt.disable(list, ignoreInvalid)
 * - list (String|Array): rule name or list of rule names to disable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * The same as [[MarkdownIt.enable]], but turn specified rules off.
 **/
MarkdownIt.prototype.disable = function (list, ignoreInvalid) {
  let result = [];

  if (!Array.isArray(list)) { list = [list]; }

  ['core', 'block', 'inline'].forEach(function (chain) {
    result = result.concat(this[chain].ruler.disable(list, true));
  }, this);

  result = result.concat(this.inline.ruler2.disable(list, true));

  const missed = list.filter(function (name) { return result.indexOf(name) < 0 });

  if (missed.length && !ignoreInvalid) {
    throw new Error('MarkdownIt. Failed to disable unknown rule(s): ' + missed)
  }
  return this
};

/** chainable
 * MarkdownIt.use(plugin, params)
 *
 * Load specified plugin with given params into current parser instance.
 * It's just a sugar to call `plugin(md, params)` with curring.
 *
 * ##### Example
 *
 * ```javascript
 * var iterator = require('markdown-it-for-inline');
 * var md = require('markdown-it')()
 *             .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
 *               tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar');
 *             });
 * ```
 **/
MarkdownIt.prototype.use = function (plugin /*, params, ... */) {
  const args = [this].concat(Array.prototype.slice.call(arguments, 1));
  plugin.apply(plugin, args);
  return this
};

/** internal
 * MarkdownIt.parse(src, env) -> Array
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Parse input string and return list of block tokens (special token type
 * "inline" will contain list of inline tokens). You should not call this
 * method directly, until you write custom renderer (for example, to produce
 * AST).
 *
 * `env` is used to pass data between "distributed" rules and return additional
 * metadata like reference info, needed for the renderer. It also can be used to
 * inject data in specific cases. Usually, you will be ok to pass `{}`,
 * and then pass updated object to renderer.
 **/
MarkdownIt.prototype.parse = function (src, env) {
  if (typeof src !== 'string') {
    throw new Error('Input data should be a String')
  }

  const state = new this.core.State(src, this, env);

  this.core.process(state);

  return state.tokens
};

/**
 * MarkdownIt.render(src [, env]) -> String
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Render markdown string into html. It does all magic for you :).
 *
 * `env` can be used to inject additional metadata (`{}` by default).
 * But you will not need it with high probability. See also comment
 * in [[MarkdownIt.parse]].
 **/
MarkdownIt.prototype.render = function (src, env) {
  env = env || {};

  return this.renderer.render(this.parse(src, env), this.options, env)
};

/** internal
 * MarkdownIt.parseInline(src, env) -> Array
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * The same as [[MarkdownIt.parse]] but skip all block rules. It returns the
 * block tokens list with the single `inline` element, containing parsed inline
 * tokens in `children` property. Also updates `env` object.
 **/
MarkdownIt.prototype.parseInline = function (src, env) {
  const state = new this.core.State(src, this, env);

  state.inlineMode = true;
  this.core.process(state);

  return state.tokens
};

/**
 * MarkdownIt.renderInline(src [, env]) -> String
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Similar to [[MarkdownIt.render]] but for single paragraph content. Result
 * will NOT be wrapped into `<p>` tags.
 **/
MarkdownIt.prototype.renderInline = function (src, env) {
  env = env || {};

  return this.renderer.render(this.parseInline(src, env), this.options, env)
};

/**
Document schema for the data model used by CommonMark.
*/
const schema$1 = new Schema$1({
    nodes: {
        doc: {
            content: "block+"
        },
        paragraph: {
            content: "inline*",
            group: "block",
            parseDOM: [{ tag: "p" }],
            toDOM() { return ["p", 0]; }
        },
        blockquote: {
            content: "block+",
            group: "block",
            parseDOM: [{ tag: "blockquote" }],
            toDOM() { return ["blockquote", 0]; }
        },
        horizontal_rule: {
            group: "block",
            parseDOM: [{ tag: "hr" }],
            toDOM() { return ["div", ["hr"]]; }
        },
        heading: {
            attrs: { level: { default: 1 } },
            content: "(text | image)*",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "h1", attrs: { level: 1 } },
                { tag: "h2", attrs: { level: 2 } },
                { tag: "h3", attrs: { level: 3 } },
                { tag: "h4", attrs: { level: 4 } },
                { tag: "h5", attrs: { level: 5 } },
                { tag: "h6", attrs: { level: 6 } }],
            toDOM(node) { return ["h" + node.attrs.level, 0]; }
        },
        code_block: {
            content: "text*",
            group: "block",
            code: true,
            defining: true,
            marks: "",
            attrs: { params: { default: "" } },
            parseDOM: [{ tag: "pre", preserveWhitespace: "full", getAttrs: node => ({ params: node.getAttribute("data-params") || "" }) }],
            toDOM(node) { return ["pre", node.attrs.params ? { "data-params": node.attrs.params } : {}, ["code", 0]]; }
        },
        ordered_list: {
            content: "list_item+",
            group: "block",
            attrs: { order: { default: 1 }, tight: { default: false } },
            parseDOM: [{ tag: "ol", getAttrs(dom) {
                        return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1,
                            tight: dom.hasAttribute("data-tight") };
                    } }],
            toDOM(node) {
                return ["ol", { start: node.attrs.order == 1 ? null : node.attrs.order,
                        "data-tight": node.attrs.tight ? "true" : null }, 0];
            }
        },
        bullet_list: {
            content: "list_item+",
            group: "block",
            attrs: { tight: { default: false } },
            parseDOM: [{ tag: "ul", getAttrs: dom => ({ tight: dom.hasAttribute("data-tight") }) }],
            toDOM(node) { return ["ul", { "data-tight": node.attrs.tight ? "true" : null }, 0]; }
        },
        list_item: {
            content: "block+",
            defining: true,
            parseDOM: [{ tag: "li" }],
            toDOM() { return ["li", 0]; }
        },
        text: {
            group: "inline"
        },
        image: {
            inline: true,
            attrs: {
                src: {},
                alt: { default: null },
                title: { default: null }
            },
            group: "inline",
            draggable: true,
            parseDOM: [{ tag: "img[src]", getAttrs(dom) {
                        return {
                            src: dom.getAttribute("src"),
                            title: dom.getAttribute("title"),
                            alt: dom.getAttribute("alt")
                        };
                    } }],
            toDOM(node) { return ["img", node.attrs]; }
        },
        hard_break: {
            inline: true,
            group: "inline",
            selectable: false,
            parseDOM: [{ tag: "br" }],
            toDOM() { return ["br"]; }
        }
    },
    marks: {
        em: {
            parseDOM: [
                { tag: "i" }, { tag: "em" },
                { style: "font-style=italic" },
                { style: "font-style=normal", clearMark: m => m.type.name == "em" }
            ],
            toDOM() { return ["em"]; }
        },
        strong: {
            parseDOM: [
                { tag: "strong" },
                { tag: "b", getAttrs: node => node.style.fontWeight != "normal" && null },
                { style: "font-weight=400", clearMark: m => m.type.name == "strong" },
                { style: "font-weight", getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
            ],
            toDOM() { return ["strong"]; }
        },
        link: {
            attrs: {
                href: {},
                title: { default: null }
            },
            inclusive: false,
            parseDOM: [{ tag: "a[href]", getAttrs(dom) {
                        return { href: dom.getAttribute("href"), title: dom.getAttribute("title") };
                    } }],
            toDOM(node) { return ["a", node.attrs]; }
        },
        code: {
            code: true,
            parseDOM: [{ tag: "code" }],
            toDOM() { return ["code"]; }
        }
    }
});

// @ts-ignore
function maybeMerge(a, b) {
    if (a.isText && b.isText && Mark$1.sameSet(a.marks, b.marks))
        return a.withText(a.text + b.text);
}
// Object used to track the context of a running parse.
class MarkdownParseState {
    constructor(schema, tokenHandlers) {
        this.schema = schema;
        this.tokenHandlers = tokenHandlers;
        this.stack = [{ type: schema.topNodeType, attrs: null, content: [], marks: Mark$1.none }];
    }
    top() {
        return this.stack[this.stack.length - 1];
    }
    push(elt) {
        if (this.stack.length)
            this.top().content.push(elt);
    }
    // Adds the given text to the current position in the document,
    // using the current marks as styling.
    addText(text) {
        if (!text)
            return;
        let top = this.top(), nodes = top.content, last = nodes[nodes.length - 1];
        let node = this.schema.text(text, top.marks), merged;
        if (last && (merged = maybeMerge(last, node)))
            nodes[nodes.length - 1] = merged;
        else
            nodes.push(node);
    }
    // Adds the given mark to the set of active marks.
    openMark(mark) {
        let top = this.top();
        top.marks = mark.addToSet(top.marks);
    }
    // Removes the given mark from the set of active marks.
    closeMark(mark) {
        let top = this.top();
        top.marks = mark.removeFromSet(top.marks);
    }
    parseTokens(toks) {
        for (let i = 0; i < toks.length; i++) {
            let tok = toks[i];
            let handler = this.tokenHandlers[tok.type];
            if (!handler)
                throw new Error("Token type `" + tok.type + "` not supported by Markdown parser");
            handler(this, tok, toks, i);
        }
    }
    // Add a node at the current position.
    addNode(type, attrs, content) {
        let top = this.top();
        let node = type.createAndFill(attrs, content, top ? top.marks : []);
        if (!node)
            return null;
        this.push(node);
        return node;
    }
    // Wrap subsequent content in a node of the given type.
    openNode(type, attrs) {
        this.stack.push({ type: type, attrs: attrs, content: [], marks: Mark$1.none });
    }
    // Close and return the node that is currently on top of the stack.
    closeNode() {
        let info = this.stack.pop();
        return this.addNode(info.type, info.attrs, info.content);
    }
}
function attrs(spec, token, tokens, i) {
    if (spec.getAttrs)
        return spec.getAttrs(token, tokens, i);
    // For backwards compatibility when `attrs` is a Function
    else if (spec.attrs instanceof Function)
        return spec.attrs(token);
    else
        return spec.attrs;
}
// Code content is represented as a single token with a `content`
// property in Markdown-it.
function noCloseToken(spec, type) {
    return spec.noCloseToken || type == "code_inline" || type == "code_block" || type == "fence";
}
function withoutTrailingNewline(str) {
    return str[str.length - 1] == "\n" ? str.slice(0, str.length - 1) : str;
}
function noOp() { }
function tokenHandlers(schema, tokens) {
    let handlers = Object.create(null);
    for (let type in tokens) {
        let spec = tokens[type];
        if (spec.block) {
            let nodeType = schema.nodeType(spec.block);
            if (noCloseToken(spec, type)) {
                handlers[type] = (state, tok, tokens, i) => {
                    state.openNode(nodeType, attrs(spec, tok, tokens, i));
                    state.addText(withoutTrailingNewline(tok.content));
                    state.closeNode();
                };
            }
            else {
                handlers[type + "_open"] = (state, tok, tokens, i) => state.openNode(nodeType, attrs(spec, tok, tokens, i));
                handlers[type + "_close"] = state => state.closeNode();
            }
        }
        else if (spec.node) {
            let nodeType = schema.nodeType(spec.node);
            handlers[type] = (state, tok, tokens, i) => state.addNode(nodeType, attrs(spec, tok, tokens, i));
        }
        else if (spec.mark) {
            let markType = schema.marks[spec.mark];
            if (noCloseToken(spec, type)) {
                handlers[type] = (state, tok, tokens, i) => {
                    state.openMark(markType.create(attrs(spec, tok, tokens, i)));
                    state.addText(withoutTrailingNewline(tok.content));
                    state.closeMark(markType);
                };
            }
            else {
                handlers[type + "_open"] = (state, tok, tokens, i) => state.openMark(markType.create(attrs(spec, tok, tokens, i)));
                handlers[type + "_close"] = state => state.closeMark(markType);
            }
        }
        else if (spec.ignore) {
            if (noCloseToken(spec, type)) {
                handlers[type] = noOp;
            }
            else {
                handlers[type + "_open"] = noOp;
                handlers[type + "_close"] = noOp;
            }
        }
        else {
            throw new RangeError("Unrecognized parsing spec " + JSON.stringify(spec));
        }
    }
    handlers.text = (state, tok) => state.addText(tok.content);
    handlers.inline = (state, tok) => state.parseTokens(tok.children);
    handlers.softbreak = handlers.softbreak || (state => state.addText(" "));
    return handlers;
}
/**
A configuration of a Markdown parser. Such a parser uses
[markdown-it](https://github.com/markdown-it/markdown-it) to
tokenize a file, and then runs the custom rules it is given over
the tokens to create a ProseMirror document tree.
*/
class MarkdownParser {
    /**
    Create a parser with the given configuration. You can configure
    the markdown-it parser to parse the dialect you want, and provide
    a description of the ProseMirror entities those tokens map to in
    the `tokens` object, which maps token names to descriptions of
    what to do with them. Such a description is an object, and may
    have the following properties:
    */
    constructor(
    /**
    The parser's document schema.
    */
    schema, 
    /**
    This parser's markdown-it tokenizer.
    */
    tokenizer, 
    /**
    The value of the `tokens` object used to construct this
    parser. Can be useful to copy and modify to base other parsers
    on.
    */
    tokens) {
        this.schema = schema;
        this.tokenizer = tokenizer;
        this.tokens = tokens;
        this.tokenHandlers = tokenHandlers(schema, tokens);
    }
    /**
    Parse a string as [CommonMark](http://commonmark.org/) markup,
    and create a ProseMirror document as prescribed by this parser's
    rules.
    
    The second argument, when given, is passed through to the
    [Markdown
    parser](https://markdown-it.github.io/markdown-it/#MarkdownIt.parse).
    */
    parse(text, markdownEnv = {}) {
        let state = new MarkdownParseState(this.schema, this.tokenHandlers), doc;
        state.parseTokens(this.tokenizer.parse(text, markdownEnv));
        do {
            doc = state.closeNode();
        } while (state.stack.length);
        return doc || this.schema.topNodeType.createAndFill();
    }
}
function listIsTight(tokens, i) {
    while (++i < tokens.length)
        if (tokens[i].type != "list_item_open")
            return tokens[i].hidden;
    return false;
}
/**
A parser parsing unextended [CommonMark](http://commonmark.org/),
without inline HTML, and producing a document in the basic schema.
*/
const defaultMarkdownParser = new MarkdownParser(schema$1, MarkdownIt("commonmark", { html: false }), {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "list_item" },
    bullet_list: { block: "bullet_list", getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
    ordered_list: { block: "ordered_list", getAttrs: (tok, tokens, i) => ({
            order: +tok.attrGet("start") || 1,
            tight: listIsTight(tokens, i)
        }) },
    heading: { block: "heading", getAttrs: tok => ({ level: +tok.tag.slice(1) }) },
    code_block: { block: "code_block", noCloseToken: true },
    fence: { block: "code_block", getAttrs: tok => ({ params: tok.info || "" }), noCloseToken: true },
    hr: { node: "horizontal_rule" },
    image: { node: "image", getAttrs: tok => ({
            src: tok.attrGet("src"),
            title: tok.attrGet("title") || null,
            alt: tok.children[0] && tok.children[0].content || null
        }) },
    hardbreak: { node: "hard_break" },
    em: { mark: "em" },
    strong: { mark: "strong" },
    link: { mark: "link", getAttrs: tok => ({
            href: tok.attrGet("href"),
            title: tok.attrGet("title") || null
        }) },
    code_inline: { mark: "code", noCloseToken: true }
});

const blankMark = { open: "", close: "", mixable: true };
/**
A specification for serializing a ProseMirror document as
Markdown/CommonMark text.
*/
class MarkdownSerializer {
    /**
    Construct a serializer with the given configuration. The `nodes`
    object should map node names in a given schema to function that
    take a serializer state and such a node, and serialize the node.
    */
    constructor(
    /**
    The node serializer functions for this serializer.
    */
    nodes, 
    /**
    The mark serializer info.
    */
    marks, options = {}) {
        this.nodes = nodes;
        this.marks = marks;
        this.options = options;
    }
    /**
    Serialize the content of the given node to
    [CommonMark](http://commonmark.org/).
    */
    serialize(content, options = {}) {
        options = Object.assign({}, this.options, options);
        let state = new MarkdownSerializerState(this.nodes, this.marks, options);
        state.renderContent(content);
        return state.out;
    }
}
/**
A serializer for the [basic schema](https://prosemirror.net/docs/ref/#schema).
*/
const defaultMarkdownSerializer = new MarkdownSerializer({
    blockquote(state, node) {
        state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    code_block(state, node) {
        // Make sure the front matter fences are longer than any dash sequence within it
        const backticks = node.textContent.match(/`{3,}/gm);
        const fence = backticks ? (backticks.sort().slice(-1)[0] + "`") : "```";
        state.write(fence + (node.attrs.params || "") + "\n");
        state.text(node.textContent, false);
        // Add a newline to the current content before adding closing marker
        state.write("\n");
        state.write(fence);
        state.closeBlock(node);
    },
    heading(state, node) {
        state.write(state.repeat("#", node.attrs.level) + " ");
        state.renderInline(node, false);
        state.closeBlock(node);
    },
    horizontal_rule(state, node) {
        state.write(node.attrs.markup || "---");
        state.closeBlock(node);
    },
    bullet_list(state, node) {
        state.renderList(node, "  ", () => (node.attrs.bullet || "*") + " ");
    },
    ordered_list(state, node) {
        let start = node.attrs.order || 1;
        let maxW = String(start + node.childCount - 1).length;
        let space = state.repeat(" ", maxW + 2);
        state.renderList(node, space, i => {
            let nStr = String(start + i);
            return state.repeat(" ", maxW - nStr.length) + nStr + ". ";
        });
    },
    list_item(state, node) {
        state.renderContent(node);
    },
    paragraph(state, node) {
        state.renderInline(node);
        state.closeBlock(node);
    },
    image(state, node) {
        state.write("![" + state.esc(node.attrs.alt || "") + "](" + node.attrs.src.replace(/[\(\)]/g, "\\$&") +
            (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : "") + ")");
    },
    hard_break(state, node, parent, index) {
        for (let i = index + 1; i < parent.childCount; i++)
            if (parent.child(i).type != node.type) {
                state.write("\\\n");
                return;
            }
    },
    text(state, node) {
        state.text(node.text, !state.inAutolink);
    }
}, {
    em: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strong: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    link: {
        open(state, mark, parent, index) {
            state.inAutolink = isPlainURL(mark, parent, index);
            return state.inAutolink ? "<" : "[";
        },
        close(state, mark, parent, index) {
            let { inAutolink } = state;
            state.inAutolink = undefined;
            return inAutolink ? ">"
                : "](" + mark.attrs.href.replace(/[\(\)"]/g, "\\$&") + (mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : "") + ")";
        },
        mixable: true
    },
    code: { open(_state, _mark, parent, index) { return backticksFor(parent.child(index), -1); },
        close(_state, _mark, parent, index) { return backticksFor(parent.child(index - 1), 1); },
        escape: false }
});
function backticksFor(node, side) {
    let ticks = /`+/g, m, len = 0;
    if (node.isText)
        while (m = ticks.exec(node.text))
            len = Math.max(len, m[0].length);
    let result = len > 0 && side > 0 ? " `" : "`";
    for (let i = 0; i < len; i++)
        result += "`";
    if (len > 0 && side < 0)
        result += " ";
    return result;
}
function isPlainURL(link, parent, index) {
    if (link.attrs.title || !/^\w+:/.test(link.attrs.href))
        return false;
    let content = parent.child(index);
    if (!content.isText || content.text != link.attrs.href || content.marks[content.marks.length - 1] != link)
        return false;
    return index == parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks);
}
/**
This is an object used to track state and expose
methods related to markdown serialization. Instances are passed to
node and mark serialization methods (see `toMarkdown`).
*/
class MarkdownSerializerState {
    /**
    @internal
    */
    constructor(
    /**
    @internal
    */
    nodes, 
    /**
    @internal
    */
    marks, 
    /**
    The options passed to the serializer.
    */
    options) {
        this.nodes = nodes;
        this.marks = marks;
        this.options = options;
        /**
        @internal
        */
        this.delim = "";
        /**
        @internal
        */
        this.out = "";
        /**
        @internal
        */
        this.closed = null;
        /**
        @internal
        */
        this.inAutolink = undefined;
        /**
        @internal
        */
        this.atBlockStart = false;
        /**
        @internal
        */
        this.inTightList = false;
        if (typeof this.options.tightLists == "undefined")
            this.options.tightLists = false;
        if (typeof this.options.hardBreakNodeName == "undefined")
            this.options.hardBreakNodeName = "hard_break";
    }
    /**
    @internal
    */
    flushClose(size = 2) {
        if (this.closed) {
            if (!this.atBlank())
                this.out += "\n";
            if (size > 1) {
                let delimMin = this.delim;
                let trim = /\s+$/.exec(delimMin);
                if (trim)
                    delimMin = delimMin.slice(0, delimMin.length - trim[0].length);
                for (let i = 1; i < size; i++)
                    this.out += delimMin + "\n";
            }
            this.closed = null;
        }
    }
    /**
    @internal
    */
    getMark(name) {
        let info = this.marks[name];
        if (!info) {
            if (this.options.strict !== false)
                throw new Error(`Mark type \`${name}\` not supported by Markdown renderer`);
            info = blankMark;
        }
        return info;
    }
    /**
    Render a block, prefixing each line with `delim`, and the first
    line in `firstDelim`. `node` should be the node that is closed at
    the end of the block, and `f` is a function that renders the
    content of the block.
    */
    wrapBlock(delim, firstDelim, node, f) {
        let old = this.delim;
        this.write(firstDelim != null ? firstDelim : delim);
        this.delim += delim;
        f();
        this.delim = old;
        this.closeBlock(node);
    }
    /**
    @internal
    */
    atBlank() {
        return /(^|\n)$/.test(this.out);
    }
    /**
    Ensure the current content ends with a newline.
    */
    ensureNewLine() {
        if (!this.atBlank())
            this.out += "\n";
    }
    /**
    Prepare the state for writing output (closing closed paragraphs,
    adding delimiters, and so on), and then optionally add content
    (unescaped) to the output.
    */
    write(content) {
        this.flushClose();
        if (this.delim && this.atBlank())
            this.out += this.delim;
        if (content)
            this.out += content;
    }
    /**
    Close the block for the given node.
    */
    closeBlock(node) {
        this.closed = node;
    }
    /**
    Add the given text to the document. When escape is not `false`,
    it will be escaped.
    */
    text(text, escape = true) {
        let lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            this.write();
            // Escape exclamation marks in front of links
            if (!escape && lines[i][0] == "[" && /(^|[^\\])\!$/.test(this.out))
                this.out = this.out.slice(0, this.out.length - 1) + "\\!";
            this.out += escape ? this.esc(lines[i], this.atBlockStart) : lines[i];
            if (i != lines.length - 1)
                this.out += "\n";
        }
    }
    /**
    Render the given node as a block.
    */
    render(node, parent, index) {
        if (this.nodes[node.type.name]) {
            this.nodes[node.type.name](this, node, parent, index);
        }
        else {
            if (this.options.strict !== false) {
                throw new Error("Token type `" + node.type.name + "` not supported by Markdown renderer");
            }
            else if (!node.type.isLeaf) {
                if (node.type.inlineContent)
                    this.renderInline(node);
                else
                    this.renderContent(node);
                if (node.isBlock)
                    this.closeBlock(node);
            }
        }
    }
    /**
    Render the contents of `parent` as block nodes.
    */
    renderContent(parent) {
        parent.forEach((node, _, i) => this.render(node, parent, i));
    }
    /**
    Render the contents of `parent` as inline content.
    */
    renderInline(parent, fromBlockStart = true) {
        this.atBlockStart = fromBlockStart;
        let active = [], trailing = "";
        let progress = (node, offset, index) => {
            let marks = node ? node.marks : [];
            // Remove marks from `hard_break` that are the last node inside
            // that mark to prevent parser edge cases with new lines just
            // before closing marks.
            if (node && node.type.name === this.options.hardBreakNodeName)
                marks = marks.filter(m => {
                    if (index + 1 == parent.childCount)
                        return false;
                    let next = parent.child(index + 1);
                    return m.isInSet(next.marks) && (!next.isText || /\S/.test(next.text));
                });
            let leading = trailing;
            trailing = "";
            // If whitespace has to be expelled from the node, adjust
            // leading and trailing accordingly.
            if (node && node.isText && marks.some(mark => {
                let info = this.getMark(mark.type.name);
                return info && info.expelEnclosingWhitespace && !mark.isInSet(active);
            })) {
                let [_, lead, rest] = /^(\s*)(.*)$/m.exec(node.text);
                if (lead) {
                    leading += lead;
                    node = rest ? node.withText(rest) : null;
                    if (!node)
                        marks = active;
                }
            }
            if (node && node.isText && marks.some(mark => {
                let info = this.getMark(mark.type.name);
                return info && info.expelEnclosingWhitespace && !this.isMarkAhead(parent, index + 1, mark);
            })) {
                let [_, rest, trail] = /^(.*?)(\s*)$/m.exec(node.text);
                if (trail) {
                    trailing = trail;
                    node = rest ? node.withText(rest) : null;
                    if (!node)
                        marks = active;
                }
            }
            let inner = marks.length ? marks[marks.length - 1] : null;
            let noEsc = inner && this.getMark(inner.type.name).escape === false;
            let len = marks.length - (noEsc ? 1 : 0);
            // Try to reorder 'mixable' marks, such as em and strong, which
            // in Markdown may be opened and closed in different order, so
            // that order of the marks for the token matches the order in
            // active.
            outer: for (let i = 0; i < len; i++) {
                let mark = marks[i];
                if (!this.getMark(mark.type.name).mixable)
                    break;
                for (let j = 0; j < active.length; j++) {
                    let other = active[j];
                    if (!this.getMark(other.type.name).mixable)
                        break;
                    if (mark.eq(other)) {
                        if (i > j)
                            marks = marks.slice(0, j).concat(mark).concat(marks.slice(j, i)).concat(marks.slice(i + 1, len));
                        else if (j > i)
                            marks = marks.slice(0, i).concat(marks.slice(i + 1, j)).concat(mark).concat(marks.slice(j, len));
                        continue outer;
                    }
                }
            }
            // Find the prefix of the mark set that didn't change
            let keep = 0;
            while (keep < Math.min(active.length, len) && marks[keep].eq(active[keep]))
                ++keep;
            // Close the marks that need to be closed
            while (keep < active.length)
                this.text(this.markString(active.pop(), false, parent, index), false);
            // Output any previously expelled trailing whitespace outside the marks
            if (leading)
                this.text(leading);
            // Open the marks that need to be opened
            if (node) {
                while (active.length < len) {
                    let add = marks[active.length];
                    active.push(add);
                    this.text(this.markString(add, true, parent, index), false);
                    this.atBlockStart = false;
                }
                // Render the node. Special case code marks, since their content
                // may not be escaped.
                if (noEsc && node.isText)
                    this.text(this.markString(inner, true, parent, index) + node.text +
                        this.markString(inner, false, parent, index + 1), false);
                else
                    this.render(node, parent, index);
                this.atBlockStart = false;
            }
            // After the first non-empty text node is rendered, the end of output
            // is no longer at block start.
            //
            // FIXME: If a non-text node writes something to the output for this
            // block, the end of output is also no longer at block start. But how
            // can we detect that?
            if ((node === null || node === void 0 ? void 0 : node.isText) && node.nodeSize > 0) {
                this.atBlockStart = false;
            }
        };
        parent.forEach(progress);
        progress(null, 0, parent.childCount);
        this.atBlockStart = false;
    }
    /**
    Render a node's content as a list. `delim` should be the extra
    indentation added to all lines except the first in an item,
    `firstDelim` is a function going from an item index to a
    delimiter for the first line of the item.
    */
    renderList(node, delim, firstDelim) {
        if (this.closed && this.closed.type == node.type)
            this.flushClose(3);
        else if (this.inTightList)
            this.flushClose(1);
        let isTight = typeof node.attrs.tight != "undefined" ? node.attrs.tight : this.options.tightLists;
        let prevTight = this.inTightList;
        this.inTightList = isTight;
        node.forEach((child, _, i) => {
            if (i && isTight)
                this.flushClose(1);
            this.wrapBlock(delim, firstDelim(i), node, () => this.render(child, node, i));
        });
        this.inTightList = prevTight;
    }
    /**
    Escape the given string so that it can safely appear in Markdown
    content. If `startOfLine` is true, also escape characters that
    have special meaning only at the start of the line.
    */
    esc(str, startOfLine = false) {
        str = str.replace(/[`*\\~\[\]_]/g, (m, i) => m == "_" && i > 0 && i + 1 < str.length && str[i - 1].match(/\w/) && str[i + 1].match(/\w/) ? m : "\\" + m);
        if (startOfLine)
            str = str.replace(/^(\+[ ]|[\-*>])/, "\\$&").replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3').replace(/^(\s*\d+)\.\s/, "$1\\. ");
        if (this.options.escapeExtraCharacters)
            str = str.replace(this.options.escapeExtraCharacters, "\\$&");
        return str;
    }
    /**
    @internal
    */
    quote(str) {
        let wrap = str.indexOf('"') == -1 ? '""' : str.indexOf("'") == -1 ? "''" : "()";
        return wrap[0] + str + wrap[1];
    }
    /**
    Repeat the given string `n` times.
    */
    repeat(str, n) {
        let out = "";
        for (let i = 0; i < n; i++)
            out += str;
        return out;
    }
    /**
    Get the markdown string for a given opening or closing mark.
    */
    markString(mark, open, parent, index) {
        let info = this.getMark(mark.type.name);
        let value = open ? info.open : info.close;
        return typeof value == "string" ? value : value(this, mark, parent, index);
    }
    /**
    Get leading and trailing whitespace from a string. Values of
    leading or trailing property of the return object will be undefined
    if there is no match.
    */
    getEnclosingWhitespace(text) {
        return {
            leading: (text.match(/^(\s+)/) || [undefined])[0],
            trailing: (text.match(/(\s+)$/) || [undefined])[0]
        };
    }
    /**
    @internal
    */
    isMarkAhead(parent, index, mark) {
        for (;; index++) {
            if (index >= parent.childCount)
                return false;
            let next = parent.child(index);
            if (next.type.name != this.options.hardBreakNodeName)
                return mark.isInSet(next.marks);
            index++;
        }
    }
}

/**
 * Build a MarkdownSerializer that extends the default one with custom
 * node and mark rules for the MarkupEditor schema.
 *
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {MarkdownSerializer}
 */
function makeSerializer(warnings) {
  // Custom node rules extending the default set
  const nodes = Object.assign({}, defaultMarkdownSerializer.nodes, {

    // image: emit ![alt](src), warn + drop width/height attrs if present
    image(state, node) {
      const { src, alt, width, height } = node.attrs;
      if (width != null) {
        warnings.add(`Image width attribute dropped (not supported in Markdown): ${width}`);
      }
      if (height != null) {
        warnings.add(`Image height attribute dropped (not supported in Markdown): ${height}`);
      }
      state.write(
        '![' + state.esc(alt || '') + '](' +
        (src || '').replace(/[()]/g, '\\$&') + ')'
      );
    },

    // table: GFM pipe-table serialization
    table(state, node) {
      if (node.attrs.class != null) {
        warnings.add(`Table class attribute dropped (not supported in Markdown): ${node.attrs.class}`);
      }
      // Gather rows — first row is treated as header, rest as body
      const rows = [];
      node.forEach(child => {
        if (child.type.name === 'table_row') rows.push(child);
      });
      if (rows.length === 0) return

      // Render header row
      const headerRow = rows[0];
      const cells = [];
      headerRow.forEach(cell => {
        cells.push(cell.textContent.trim());
      });
      state.write('| ' + cells.join(' | ') + ' |');
      state.write('\n');

      // Separator
      state.write('| ' + cells.map(() => '---').join(' | ') + ' |');
      state.write('\n');

      // Body rows
      for (let i = 1; i < rows.length; i++) {
        const rowCells = [];
        rows[i].forEach(cell => {
          rowCells.push(cell.textContent.trim());
        });
        state.write('| ' + rowCells.join(' | ') + ' |');
        state.write('\n');
      }
      state.write('\n');
    },

    // table_row and table_cell are handled inside table serializer above;
    // define them as no-ops to avoid "node not handled" errors
    table_row(state, node) {
      // Rendered by the parent table serializer
    },

    table_cell(state, node) {
      // Rendered by the parent table serializer
    },

    table_header(state, node) {
      // Rendered by the parent table serializer
    },

    // code_block: a code_block at position 0 in the doc root is treated as the
    // HTML preamble block that was injected during import. Serialize it as raw
    // HTML (no fences) so the round-trip produces the original preamble.
    // The schema has no language attribute, so detection is purely positional.
    // All other code_blocks serialize as standard fenced blocks.
    code_block(state, node, parent, index) {
      if (index === 0 && parent && parent.type.name === 'doc') {
        state.write(node.textContent);
        state.closeBlock(node);
      } else {
        state.write('```\n');
        state.text(node.textContent, false);
        state.ensureNewLine();
        state.write('```');
        state.closeBlock(node);
      }
    },

    // div: warn + serialize children as block content, drop wrapper
    div(state, node) {
      warnings.add('div element wrapper dropped (not supported in Markdown); serializing children');
      state.renderContent(node);
    },

    // button: warn + drop content entirely
    button(state, node) {
      warnings.add(`button element dropped (not supported in Markdown): "${node.textContent}"`);
    },

    // heading: wrap default to check for id attr
    heading(state, node) {
      if (node.attrs.id != null) {
        warnings.add(`Heading id attribute dropped (not supported in Markdown): ${node.attrs.id}`);
      }
      state.write(state.repeat('#', node.attrs.level) + ' ');
      state.renderInline(node, false);
      state.closeBlock(node);
    }
  });

  // Custom mark rules extending the default set
  const marks = Object.assign({}, defaultMarkdownSerializer.marks, {

    // s (strikethrough): ~~text~~
    s: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true
    },

    // u (underline): warn + render as plain text
    u: {
      open(state) {
        warnings.add('Underline mark has no Markdown equivalent; rendering as plain text');
        return ''
      },
      close: ''
    },

    // sub: warn + render as plain text
    sub: {
      open(state) {
        warnings.add('Subscript mark has no Markdown equivalent; rendering as plain text');
        return ''
      },
      close: ''
    },

    // sup: warn + render as plain text
    sup: {
      open(state) {
        warnings.add('Superscript mark has no Markdown equivalent; rendering as plain text');
        return ''
      },
      close: ''
    }
  });

  return new MarkdownSerializer(nodes, marks)
}

/**
 * Build a MarkdownParser that handles GFM tables and strikethrough,
 * in addition to all the tokens handled by defaultMarkdownParser.
 *
 * @param {object} schema   - ProseMirror Schema instance
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {MarkdownParser}
 */
function makeParser(schema, warnings) {
  // Use markdown-it in 'default' mode (includes table support) with html disabled.
  // The 'default' mode includes GFM tables; commonmark does not.
  const tokenizer = new MarkdownIt({ html: true });

  // Start from the default token set and add table + strikethrough support
  const tokens = Object.assign({}, defaultMarkdownParser.tokens, {
    // GFM table nodes — map to prosemirror-tables node types
    // thead and tbody are structural wrappers in markdown-it but not in the schema;
    // ignore them so only table/table_row/table_cell are created.
    table:    { block: 'table' },
    thead:    { ignore: true },
    tbody:    { ignore: true },
    tr:       { block: 'table_row' },

    // table_cell requires block+ content. The prosemirror-markdown `block` mapping
    // would open the cell node and let inline text land directly in it, but
    // `createAndFill` would then silently drop the text because it can't satisfy
    // the `block+` constraint with raw inline nodes.
    //
    // Instead, use custom `_open`/`_close` handlers that also open/close a
    // paragraph inside each cell so the inline text has a valid block to live in.
    //
    // th maps to table_cell (header status is not preserved in the schema)

    // Strikethrough mark
    s:        { mark: 's' }
  });

  // Manually add cell handlers that wrap content in a paragraph.
  // We reach into the tokenHandlers map after construction via a wrapper.
  const cellOpen = (state) => {
    state.openNode(schema.nodes.table_cell, null);
    state.openNode(schema.nodes.paragraph, null);
  };
  const cellClose = (state) => {
    state.closeNode(); // close paragraph
    state.closeNode(); // close table_cell
  };

  // Build the parser, then replace the auto-generated th/td handlers with our
  // paragraph-wrapping versions.  MarkdownParser stores handlers in
  // `this.tokenHandlers` which is a plain object we can patch directly.
  const parser = new MarkdownParser(schema, tokenizer, tokens);
  parser.tokenHandlers['th_open']  = cellOpen;
  parser.tokenHandlers['th_close'] = cellClose;
  parser.tokenHandlers['td_open']  = cellOpen;
  parser.tokenHandlers['td_close'] = cellClose;

  parser.tokenHandlers['html_block'] = (state, tok) => {
    warnings.add(`Raw HTML block stripped (not supported in MarkupEditor): ${tok.content.slice(0, 60).trim()}`);
  };
  parser.tokenHandlers['html_inline'] = (state, tok) => {
    // Insert as literal text rather than dropping — preserves content like \<substitutions>
    // where the backslash escape was consumed by the JS string transport layer.
    state.addText(tok.content);
  };

  return parser
}

/**
 * Warning collector utility.
 * Returns an object with add(msg) and get() methods.
 */
function makeWarnings() {
  const list = [];
  return {
    add(msg) { list.push(msg); },
    get() { return [...list] }
  }
}

// ::- Persistent data structure representing an ordered mapping from
// strings to values, with some convenient update methods.
function OrderedMap(content) {
  this.content = content;
}

OrderedMap.prototype = {
  constructor: OrderedMap,

  find: function(key) {
    for (var i = 0; i < this.content.length; i += 2)
      if (this.content[i] === key) return i
    return -1
  },

  // :: (string) → ?any
  // Retrieve the value stored under `key`, or return undefined when
  // no such key exists.
  get: function(key) {
    var found = this.find(key);
    return found == -1 ? undefined : this.content[found + 1]
  },

  // :: (string, any, ?string) → OrderedMap
  // Create a new map by replacing the value of `key` with a new
  // value, or adding a binding to the end of the map. If `newKey` is
  // given, the key of the binding will be replaced with that key.
  update: function(key, value, newKey) {
    var self = newKey && newKey != key ? this.remove(newKey) : this;
    var found = self.find(key), content = self.content.slice();
    if (found == -1) {
      content.push(newKey || key, value);
    } else {
      content[found + 1] = value;
      if (newKey) content[found] = newKey;
    }
    return new OrderedMap(content)
  },

  // :: (string) → OrderedMap
  // Return a map with the given key removed, if it existed.
  remove: function(key) {
    var found = this.find(key);
    if (found == -1) return this
    var content = this.content.slice();
    content.splice(found, 2);
    return new OrderedMap(content)
  },

  // :: (string, any) → OrderedMap
  // Add a new key to the start of the map.
  addToStart: function(key, value) {
    return new OrderedMap([key, value].concat(this.remove(key).content))
  },

  // :: (string, any) → OrderedMap
  // Add a new key to the end of the map.
  addToEnd: function(key, value) {
    var content = this.remove(key).content.slice();
    content.push(key, value);
    return new OrderedMap(content)
  },

  // :: (string, string, any) → OrderedMap
  // Add a key after the given key. If `place` is not found, the new
  // key is added to the end.
  addBefore: function(place, key, value) {
    var without = this.remove(key), content = without.content.slice();
    var found = without.find(place);
    content.splice(found == -1 ? content.length : found, 0, key, value);
    return new OrderedMap(content)
  },

  // :: ((key: string, value: any))
  // Call the given function for each key/value pair in the map, in
  // order.
  forEach: function(f) {
    for (var i = 0; i < this.content.length; i += 2)
      f(this.content[i], this.content[i + 1]);
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a new map by prepending the keys in this map that don't
  // appear in `map` before the keys in `map`.
  prepend: function(map) {
    map = OrderedMap.from(map);
    if (!map.size) return this
    return new OrderedMap(map.content.concat(this.subtract(map).content))
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a new map by appending the keys in this map that don't
  // appear in `map` after the keys in `map`.
  append: function(map) {
    map = OrderedMap.from(map);
    if (!map.size) return this
    return new OrderedMap(this.subtract(map).content.concat(map.content))
  },

  // :: (union<Object, OrderedMap>) → OrderedMap
  // Create a map containing all the keys in this map that don't
  // appear in `map`.
  subtract: function(map) {
    var result = this;
    map = OrderedMap.from(map);
    for (var i = 0; i < map.content.length; i += 2)
      result = result.remove(map.content[i]);
    return result
  },

  // :: () → Object
  // Turn ordered map into a plain object.
  toObject: function() {
    var result = {};
    this.forEach(function(key, value) { result[key] = value; });
    return result
  },

  // :: number
  // The amount of keys in this map.
  get size() {
    return this.content.length >> 1
  }
};

// :: (?union<Object, OrderedMap>) → OrderedMap
// Return a map with the given content. If null, create an empty
// map. If given an ordered map, return that map itself. If given an
// object, create a map from the object's properties.
OrderedMap.from = function(value) {
  if (value instanceof OrderedMap) return value
  var content = [];
  if (value) for (var prop in value) content.push(prop, value[prop]);
  return new OrderedMap(content)
};

function findDiffStart(a, b, pos) {
    for (let i = 0;; i++) {
        if (i == a.childCount || i == b.childCount)
            return a.childCount == b.childCount ? null : pos;
        let childA = a.child(i), childB = b.child(i);
        if (childA == childB) {
            pos += childA.nodeSize;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return pos;
        if (childA.isText && childA.text != childB.text) {
            for (let j = 0; childA.text[j] == childB.text[j]; j++)
                pos++;
            return pos;
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffStart(childA.content, childB.content, pos + 1);
            if (inner != null)
                return inner;
        }
        pos += childA.nodeSize;
    }
}
function findDiffEnd(a, b, posA, posB) {
    for (let iA = a.childCount, iB = b.childCount;;) {
        if (iA == 0 || iB == 0)
            return iA == iB ? null : { a: posA, b: posB };
        let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize;
        if (childA == childB) {
            posA -= size;
            posB -= size;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return { a: posA, b: posB };
        if (childA.isText && childA.text != childB.text) {
            let same = 0, minSize = Math.min(childA.text.length, childB.text.length);
            while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
                same++;
                posA--;
                posB--;
            }
            return { a: posA, b: posB };
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1);
            if (inner)
                return inner;
        }
        posA -= size;
        posB -= size;
    }
}

/**
A fragment represents a node's collection of child nodes.

Like nodes, fragments are persistent data structures, and you
should not mutate them or their content. Rather, you create new
instances whenever needed. The API tries to make this easy.
*/
class Fragment {
    /**
    @internal
    */
    constructor(
    /**
    The child nodes in this fragment.
    */
    content, size) {
        this.content = content;
        this.size = size || 0;
        if (size == null)
            for (let i = 0; i < content.length; i++)
                this.size += content[i].nodeSize;
    }
    /**
    Invoke a callback for all descendant nodes between the given two
    positions (relative to start of this fragment). Doesn't descend
    into a node when the callback returns `false`.
    */
    nodesBetween(from, to, f, nodeStart = 0, parent) {
        for (let i = 0, pos = 0; pos < to; i++) {
            let child = this.content[i], end = pos + child.nodeSize;
            if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
                let start = pos + 1;
                child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
            }
            pos = end;
        }
    }
    /**
    Call the given callback for every descendant node. `pos` will be
    relative to the start of the fragment. The callback may return
    `false` to prevent traversal of a given node's children.
    */
    descendants(f) {
        this.nodesBetween(0, this.size, f);
    }
    /**
    Extract the text between `from` and `to`. See the same method on
    [`Node`](https://prosemirror.net/docs/ref/#model.Node.textBetween).
    */
    textBetween(from, to, blockSeparator, leafText) {
        let text = "", first = true;
        this.nodesBetween(from, to, (node, pos) => {
            let nodeText = node.isText ? node.text.slice(Math.max(from, pos) - pos, to - pos)
                : !node.isLeaf ? ""
                    : leafText ? (typeof leafText === "function" ? leafText(node) : leafText)
                        : node.type.spec.leafText ? node.type.spec.leafText(node)
                            : "";
            if (node.isBlock && (node.isLeaf && nodeText || node.isTextblock) && blockSeparator) {
                if (first)
                    first = false;
                else
                    text += blockSeparator;
            }
            text += nodeText;
        }, 0);
        return text;
    }
    /**
    Create a new fragment containing the combined content of this
    fragment and the other.
    */
    append(other) {
        if (!other.size)
            return this;
        if (!this.size)
            return other;
        let last = this.lastChild, first = other.firstChild, content = this.content.slice(), i = 0;
        if (last.isText && last.sameMarkup(first)) {
            content[content.length - 1] = last.withText(last.text + first.text);
            i = 1;
        }
        for (; i < other.content.length; i++)
            content.push(other.content[i]);
        return new Fragment(content, this.size + other.size);
    }
    /**
    Cut out the sub-fragment between the two given positions.
    */
    cut(from, to = this.size) {
        if (from == 0 && to == this.size)
            return this;
        let result = [], size = 0;
        if (to > from)
            for (let i = 0, pos = 0; pos < to; i++) {
                let child = this.content[i], end = pos + child.nodeSize;
                if (end > from) {
                    if (pos < from || end > to) {
                        if (child.isText)
                            child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
                        else
                            child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
                    }
                    result.push(child);
                    size += child.nodeSize;
                }
                pos = end;
            }
        return new Fragment(result, size);
    }
    /**
    @internal
    */
    cutByIndex(from, to) {
        if (from == to)
            return Fragment.empty;
        if (from == 0 && to == this.content.length)
            return this;
        return new Fragment(this.content.slice(from, to));
    }
    /**
    Create a new fragment in which the node at the given index is
    replaced by the given node.
    */
    replaceChild(index, node) {
        let current = this.content[index];
        if (current == node)
            return this;
        let copy = this.content.slice();
        let size = this.size + node.nodeSize - current.nodeSize;
        copy[index] = node;
        return new Fragment(copy, size);
    }
    /**
    Create a new fragment by prepending the given node to this
    fragment.
    */
    addToStart(node) {
        return new Fragment([node].concat(this.content), this.size + node.nodeSize);
    }
    /**
    Create a new fragment by appending the given node to this
    fragment.
    */
    addToEnd(node) {
        return new Fragment(this.content.concat(node), this.size + node.nodeSize);
    }
    /**
    Compare this fragment to another one.
    */
    eq(other) {
        if (this.content.length != other.content.length)
            return false;
        for (let i = 0; i < this.content.length; i++)
            if (!this.content[i].eq(other.content[i]))
                return false;
        return true;
    }
    /**
    The first child of the fragment, or `null` if it is empty.
    */
    get firstChild() { return this.content.length ? this.content[0] : null; }
    /**
    The last child of the fragment, or `null` if it is empty.
    */
    get lastChild() { return this.content.length ? this.content[this.content.length - 1] : null; }
    /**
    The number of child nodes in this fragment.
    */
    get childCount() { return this.content.length; }
    /**
    Get the child node at the given index. Raise an error when the
    index is out of range.
    */
    child(index) {
        let found = this.content[index];
        if (!found)
            throw new RangeError("Index " + index + " out of range for " + this);
        return found;
    }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) {
        return this.content[index] || null;
    }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) {
        for (let i = 0, p = 0; i < this.content.length; i++) {
            let child = this.content[i];
            f(child, p, i);
            p += child.nodeSize;
        }
    }
    /**
    Find the first position at which this fragment and another
    fragment differ, or `null` if they are the same.
    */
    findDiffStart(other, pos = 0) {
        return findDiffStart(this, other, pos);
    }
    /**
    Find the first position, searching from the end, at which this
    fragment and the given fragment differ, or `null` if they are
    the same. Since this position will not be the same in both
    nodes, an object with two separate positions is returned.
    */
    findDiffEnd(other, pos = this.size, otherPos = other.size) {
        return findDiffEnd(this, other, pos, otherPos);
    }
    /**
    Find the index and inner offset corresponding to a given relative
    position in this fragment. The result object will be reused
    (overwritten) the next time the function is called. @internal
    */
    findIndex(pos) {
        if (pos == 0)
            return retIndex(0, pos);
        if (pos == this.size)
            return retIndex(this.content.length, pos);
        if (pos > this.size || pos < 0)
            throw new RangeError(`Position ${pos} outside of fragment (${this})`);
        for (let i = 0, curPos = 0;; i++) {
            let cur = this.child(i), end = curPos + cur.nodeSize;
            if (end >= pos) {
                if (end == pos)
                    return retIndex(i + 1, end);
                return retIndex(i, curPos);
            }
            curPos = end;
        }
    }
    /**
    Return a debugging string that describes this fragment.
    */
    toString() { return "<" + this.toStringInner() + ">"; }
    /**
    @internal
    */
    toStringInner() { return this.content.join(", "); }
    /**
    Create a JSON-serializeable representation of this fragment.
    */
    toJSON() {
        return this.content.length ? this.content.map(n => n.toJSON()) : null;
    }
    /**
    Deserialize a fragment from its JSON representation.
    */
    static fromJSON(schema, value) {
        if (!value)
            return Fragment.empty;
        if (!Array.isArray(value))
            throw new RangeError("Invalid input for Fragment.fromJSON");
        return new Fragment(value.map(schema.nodeFromJSON));
    }
    /**
    Build a fragment from an array of nodes. Ensures that adjacent
    text nodes with the same marks are joined together.
    */
    static fromArray(array) {
        if (!array.length)
            return Fragment.empty;
        let joined, size = 0;
        for (let i = 0; i < array.length; i++) {
            let node = array[i];
            size += node.nodeSize;
            if (i && node.isText && array[i - 1].sameMarkup(node)) {
                if (!joined)
                    joined = array.slice(0, i);
                joined[joined.length - 1] = node
                    .withText(joined[joined.length - 1].text + node.text);
            }
            else if (joined) {
                joined.push(node);
            }
        }
        return new Fragment(joined || array, size);
    }
    /**
    Create a fragment from something that can be interpreted as a
    set of nodes. For `null`, it returns the empty fragment. For a
    fragment, the fragment itself. For a node or array of nodes, a
    fragment containing those nodes.
    */
    static from(nodes) {
        if (!nodes)
            return Fragment.empty;
        if (nodes instanceof Fragment)
            return nodes;
        if (Array.isArray(nodes))
            return this.fromArray(nodes);
        if (nodes.attrs)
            return new Fragment([nodes], nodes.nodeSize);
        throw new RangeError("Can not convert " + nodes + " to a Fragment" +
            (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""));
    }
}
/**
An empty fragment. Intended to be reused whenever a node doesn't
contain anything (rather than allocating a new empty fragment for
each leaf node).
*/
Fragment.empty = new Fragment([], 0);
const found = { index: 0, offset: 0 };
function retIndex(index, offset) {
    found.index = index;
    found.offset = offset;
    return found;
}

function compareDeep(a, b) {
    if (a === b)
        return true;
    if (!(a && typeof a == "object") ||
        !(b && typeof b == "object"))
        return false;
    let array = Array.isArray(a);
    if (Array.isArray(b) != array)
        return false;
    if (array) {
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!compareDeep(a[i], b[i]))
                return false;
    }
    else {
        for (let p in a)
            if (!(p in b) || !compareDeep(a[p], b[p]))
                return false;
        for (let p in b)
            if (!(p in a))
                return false;
    }
    return true;
}

/**
A mark is a piece of information that can be attached to a node,
such as it being emphasized, in code font, or a link. It has a
type and optionally a set of attributes that provide further
information (such as the target of the link). Marks are created
through a `Schema`, which controls which types exist and which
attributes they have.
*/
class Mark {
    /**
    @internal
    */
    constructor(
    /**
    The type of this mark.
    */
    type, 
    /**
    The attributes associated with this mark.
    */
    attrs) {
        this.type = type;
        this.attrs = attrs;
    }
    /**
    Given a set of marks, create a new set which contains this one as
    well, in the right position. If this mark is already in the set,
    the set itself is returned. If any marks that are set to be
    [exclusive](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) with this mark are present,
    those are replaced by this one.
    */
    addToSet(set) {
        let copy, placed = false;
        for (let i = 0; i < set.length; i++) {
            let other = set[i];
            if (this.eq(other))
                return set;
            if (this.type.excludes(other.type)) {
                if (!copy)
                    copy = set.slice(0, i);
            }
            else if (other.type.excludes(this.type)) {
                return set;
            }
            else {
                if (!placed && other.type.rank > this.type.rank) {
                    if (!copy)
                        copy = set.slice(0, i);
                    copy.push(this);
                    placed = true;
                }
                if (copy)
                    copy.push(other);
            }
        }
        if (!copy)
            copy = set.slice();
        if (!placed)
            copy.push(this);
        return copy;
    }
    /**
    Remove this mark from the given set, returning a new set. If this
    mark is not in the set, the set itself is returned.
    */
    removeFromSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return set.slice(0, i).concat(set.slice(i + 1));
        return set;
    }
    /**
    Test whether this mark is in the given set of marks.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return true;
        return false;
    }
    /**
    Test whether this mark has the same type and attributes as
    another mark.
    */
    eq(other) {
        return this == other ||
            (this.type == other.type && compareDeep(this.attrs, other.attrs));
    }
    /**
    Convert this mark to a JSON-serializeable representation.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        return obj;
    }
    /**
    Deserialize a mark from JSON.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Mark.fromJSON");
        let type = schema.marks[json.type];
        if (!type)
            throw new RangeError(`There is no mark type ${json.type} in this schema`);
        let mark = type.create(json.attrs);
        type.checkAttrs(mark.attrs);
        return mark;
    }
    /**
    Test whether two sets of marks are identical.
    */
    static sameSet(a, b) {
        if (a == b)
            return true;
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!a[i].eq(b[i]))
                return false;
        return true;
    }
    /**
    Create a properly sorted mark set from null, a single mark, or an
    unsorted array of marks.
    */
    static setFrom(marks) {
        if (!marks || Array.isArray(marks) && marks.length == 0)
            return Mark.none;
        if (marks instanceof Mark)
            return [marks];
        let copy = marks.slice();
        copy.sort((a, b) => a.type.rank - b.type.rank);
        return copy;
    }
}
/**
The empty set of marks.
*/
Mark.none = [];

/**
Error type raised by [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) when
given an invalid replacement.
*/
class ReplaceError extends Error {
}
/*
ReplaceError = function(this: any, message: string) {
  let err = Error.call(this, message)
  ;(err as any).__proto__ = ReplaceError.prototype
  return err
} as any

ReplaceError.prototype = Object.create(Error.prototype)
ReplaceError.prototype.constructor = ReplaceError
ReplaceError.prototype.name = "ReplaceError"
*/
/**
A slice represents a piece cut out of a larger document. It
stores not only a fragment, but also the depth up to which nodes on
both side are ‘open’ (cut through).
*/
class Slice {
    /**
    Create a slice. When specifying a non-zero open depth, you must
    make sure that there are nodes of at least that depth at the
    appropriate side of the fragment—i.e. if the fragment is an
    empty paragraph node, `openStart` and `openEnd` can't be greater
    than 1.
    
    It is not necessary for the content of open nodes to conform to
    the schema's content constraints, though it should be a valid
    start/end/middle for such a node, depending on which sides are
    open.
    */
    constructor(
    /**
    The slice's content.
    */
    content, 
    /**
    The open depth at the start of the fragment.
    */
    openStart, 
    /**
    The open depth at the end.
    */
    openEnd) {
        this.content = content;
        this.openStart = openStart;
        this.openEnd = openEnd;
    }
    /**
    The size this slice would add when inserted into a document.
    */
    get size() {
        return this.content.size - this.openStart - this.openEnd;
    }
    /**
    @internal
    */
    insertAt(pos, fragment) {
        let content = insertInto(this.content, pos + this.openStart, fragment);
        return content && new Slice(content, this.openStart, this.openEnd);
    }
    /**
    @internal
    */
    removeBetween(from, to) {
        return new Slice(removeRange(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd);
    }
    /**
    Tests whether this slice is equal to another slice.
    */
    eq(other) {
        return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd;
    }
    /**
    @internal
    */
    toString() {
        return this.content + "(" + this.openStart + "," + this.openEnd + ")";
    }
    /**
    Convert a slice to a JSON-serializable representation.
    */
    toJSON() {
        if (!this.content.size)
            return null;
        let json = { content: this.content.toJSON() };
        if (this.openStart > 0)
            json.openStart = this.openStart;
        if (this.openEnd > 0)
            json.openEnd = this.openEnd;
        return json;
    }
    /**
    Deserialize a slice from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            return Slice.empty;
        let openStart = json.openStart || 0, openEnd = json.openEnd || 0;
        if (typeof openStart != "number" || typeof openEnd != "number")
            throw new RangeError("Invalid input for Slice.fromJSON");
        return new Slice(Fragment.fromJSON(schema, json.content), openStart, openEnd);
    }
    /**
    Create a slice from a fragment by taking the maximum possible
    open value on both side of the fragment.
    */
    static maxOpen(fragment, openIsolating = true) {
        let openStart = 0, openEnd = 0;
        for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild)
            openStart++;
        for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild)
            openEnd++;
        return new Slice(fragment, openStart, openEnd);
    }
}
/**
The empty slice.
*/
Slice.empty = new Slice(Fragment.empty, 0, 0);
function removeRange(content, from, to) {
    let { index, offset } = content.findIndex(from), child = content.maybeChild(index);
    let { index: indexTo, offset: offsetTo } = content.findIndex(to);
    if (offset == from || child.isText) {
        if (offsetTo != to && !content.child(indexTo).isText)
            throw new RangeError("Removing non-flat range");
        return content.cut(0, from).append(content.cut(to));
    }
    if (index != indexTo)
        throw new RangeError("Removing non-flat range");
    return content.replaceChild(index, child.copy(removeRange(child.content, from - offset - 1, to - offset - 1)));
}
function insertInto(content, dist, insert, parent) {
    let { index, offset } = content.findIndex(dist), child = content.maybeChild(index);
    if (offset == dist || child.isText) {
        if (parent && !parent.canReplace(index, index, insert))
            return null;
        return content.cut(0, dist).append(insert).append(content.cut(dist));
    }
    let inner = insertInto(child.content, dist - offset - 1, insert, child);
    return inner && content.replaceChild(index, child.copy(inner));
}
function replace($from, $to, slice) {
    if (slice.openStart > $from.depth)
        throw new ReplaceError("Inserted content deeper than insertion position");
    if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
        throw new ReplaceError("Inconsistent open depths");
    return replaceOuter($from, $to, slice, 0);
}
function replaceOuter($from, $to, slice, depth) {
    let index = $from.index(depth), node = $from.node(depth);
    if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
        let inner = replaceOuter($from, $to, slice, depth + 1);
        return node.copy(node.content.replaceChild(index, inner));
    }
    else if (!slice.content.size) {
        return close(node, replaceTwoWay($from, $to, depth));
    }
    else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
        let parent = $from.parent, content = parent.content;
        return close(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)));
    }
    else {
        let { start, end } = prepareSliceForReplace(slice, $from);
        return close(node, replaceThreeWay($from, start, end, $to, depth));
    }
}
function checkJoin(main, sub) {
    if (!sub.type.compatibleContent(main.type))
        throw new ReplaceError("Cannot join " + sub.type.name + " onto " + main.type.name);
}
function joinable($before, $after, depth) {
    let node = $before.node(depth);
    checkJoin(node, $after.node(depth));
    return node;
}
function addNode(child, target) {
    let last = target.length - 1;
    if (last >= 0 && child.isText && child.sameMarkup(target[last]))
        target[last] = child.withText(target[last].text + child.text);
    else
        target.push(child);
}
function addRange($start, $end, depth, target) {
    let node = ($end || $start).node(depth);
    let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount;
    if ($start) {
        startIndex = $start.index(depth);
        if ($start.depth > depth) {
            startIndex++;
        }
        else if ($start.textOffset) {
            addNode($start.nodeAfter, target);
            startIndex++;
        }
    }
    for (let i = startIndex; i < endIndex; i++)
        addNode(node.child(i), target);
    if ($end && $end.depth == depth && $end.textOffset)
        addNode($end.nodeBefore, target);
}
function close(node, content) {
    node.type.checkContent(content);
    return node.copy(content);
}
function replaceThreeWay($from, $start, $end, $to, depth) {
    let openStart = $from.depth > depth && joinable($from, $start, depth + 1);
    let openEnd = $to.depth > depth && joinable($end, $to, depth + 1);
    let content = [];
    addRange(null, $from, depth, content);
    if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
        checkJoin(openStart, openEnd);
        addNode(close(openStart, replaceThreeWay($from, $start, $end, $to, depth + 1)), content);
    }
    else {
        if (openStart)
            addNode(close(openStart, replaceTwoWay($from, $start, depth + 1)), content);
        addRange($start, $end, depth, content);
        if (openEnd)
            addNode(close(openEnd, replaceTwoWay($end, $to, depth + 1)), content);
    }
    addRange($to, null, depth, content);
    return new Fragment(content);
}
function replaceTwoWay($from, $to, depth) {
    let content = [];
    addRange(null, $from, depth, content);
    if ($from.depth > depth) {
        let type = joinable($from, $to, depth + 1);
        addNode(close(type, replaceTwoWay($from, $to, depth + 1)), content);
    }
    addRange($to, null, depth, content);
    return new Fragment(content);
}
function prepareSliceForReplace(slice, $along) {
    let extra = $along.depth - slice.openStart, parent = $along.node(extra);
    let node = parent.copy(slice.content);
    for (let i = extra - 1; i >= 0; i--)
        node = $along.node(i).copy(Fragment.from(node));
    return { start: node.resolveNoCache(slice.openStart + extra),
        end: node.resolveNoCache(node.content.size - slice.openEnd - extra) };
}

/**
You can [_resolve_](https://prosemirror.net/docs/ref/#model.Node.resolve) a position to get more
information about it. Objects of this class represent such a
resolved position, providing various pieces of context
information, and some helper methods.

Throughout this interface, methods that take an optional `depth`
parameter will interpret undefined as `this.depth` and negative
numbers as `this.depth + value`.
*/
class ResolvedPos {
    /**
    @internal
    */
    constructor(
    /**
    The position that was resolved.
    */
    pos, 
    /**
    @internal
    */
    path, 
    /**
    The offset this position has into its parent node.
    */
    parentOffset) {
        this.pos = pos;
        this.path = path;
        this.parentOffset = parentOffset;
        this.depth = path.length / 3 - 1;
    }
    /**
    @internal
    */
    resolveDepth(val) {
        if (val == null)
            return this.depth;
        if (val < 0)
            return this.depth + val;
        return val;
    }
    /**
    The parent node that the position points into. Note that even if
    a position points into a text node, that node is not considered
    the parent—text nodes are ‘flat’ in this model, and have no content.
    */
    get parent() { return this.node(this.depth); }
    /**
    The root node in which the position was resolved.
    */
    get doc() { return this.node(0); }
    /**
    The ancestor node at the given level. `p.node(p.depth)` is the
    same as `p.parent`.
    */
    node(depth) { return this.path[this.resolveDepth(depth) * 3]; }
    /**
    The index into the ancestor at the given level. If this points
    at the 3rd node in the 2nd paragraph on the top level, for
    example, `p.index(0)` is 1 and `p.index(1)` is 2.
    */
    index(depth) { return this.path[this.resolveDepth(depth) * 3 + 1]; }
    /**
    The index pointing after this position into the ancestor at the
    given level.
    */
    indexAfter(depth) {
        depth = this.resolveDepth(depth);
        return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1);
    }
    /**
    The (absolute) position at the start of the node at the given
    level.
    */
    start(depth) {
        depth = this.resolveDepth(depth);
        return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
    }
    /**
    The (absolute) position at the end of the node at the given
    level.
    */
    end(depth) {
        depth = this.resolveDepth(depth);
        return this.start(depth) + this.node(depth).content.size;
    }
    /**
    The (absolute) position directly before the wrapping node at the
    given level, or, when `depth` is `this.depth + 1`, the original
    position.
    */
    before(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position before the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1];
    }
    /**
    The (absolute) position directly after the wrapping node at the
    given level, or the original position when `depth` is `this.depth + 1`.
    */
    after(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position after the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize;
    }
    /**
    When this position points into a text node, this returns the
    distance between the position and the start of the text node.
    Will be zero for positions that point between nodes.
    */
    get textOffset() { return this.pos - this.path[this.path.length - 1]; }
    /**
    Get the node directly after the position, if any. If the position
    points into a text node, only the part of that node after the
    position is returned.
    */
    get nodeAfter() {
        let parent = this.parent, index = this.index(this.depth);
        if (index == parent.childCount)
            return null;
        let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index);
        return dOff ? parent.child(index).cut(dOff) : child;
    }
    /**
    Get the node directly before the position, if any. If the
    position points into a text node, only the part of that node
    before the position is returned.
    */
    get nodeBefore() {
        let index = this.index(this.depth);
        let dOff = this.pos - this.path[this.path.length - 1];
        if (dOff)
            return this.parent.child(index).cut(0, dOff);
        return index == 0 ? null : this.parent.child(index - 1);
    }
    /**
    Get the position at the given index in the parent node at the
    given depth (which defaults to `this.depth`).
    */
    posAtIndex(index, depth) {
        depth = this.resolveDepth(depth);
        let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
        for (let i = 0; i < index; i++)
            pos += node.child(i).nodeSize;
        return pos;
    }
    /**
    Get the marks at this position, factoring in the surrounding
    marks' [`inclusive`](https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive) property. If the
    position is at the start of a non-empty node, the marks of the
    node after it (if any) are returned.
    */
    marks() {
        let parent = this.parent, index = this.index();
        // In an empty parent, return the empty array
        if (parent.content.size == 0)
            return Mark.none;
        // When inside a text node, just return the text node's marks
        if (this.textOffset)
            return parent.child(index).marks;
        let main = parent.maybeChild(index - 1), other = parent.maybeChild(index);
        // If the `after` flag is true of there is no node before, make
        // the node after this position the main reference.
        if (!main) {
            let tmp = main;
            main = other;
            other = tmp;
        }
        // Use all marks in the main node, except those that have
        // `inclusive` set to false and are not present in the other node.
        let marks = main.marks;
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    Get the marks after the current position, if any, except those
    that are non-inclusive and not present at position `$end`. This
    is mostly useful for getting the set of marks to preserve after a
    deletion. Will return `null` if this position is at the end of
    its parent node or its parent node isn't a textblock (in which
    case no marks should be preserved).
    */
    marksAcross($end) {
        let after = this.parent.maybeChild(this.index());
        if (!after || !after.isInline)
            return null;
        let marks = after.marks, next = $end.parent.maybeChild($end.index());
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    The depth up to which this position and the given (non-resolved)
    position share the same parent nodes.
    */
    sharedDepth(pos) {
        for (let depth = this.depth; depth > 0; depth--)
            if (this.start(depth) <= pos && this.end(depth) >= pos)
                return depth;
        return 0;
    }
    /**
    Returns a range based on the place where this position and the
    given position diverge around block content. If both point into
    the same textblock, for example, a range around that textblock
    will be returned. If they point into different blocks, the range
    around those blocks in their shared ancestor is returned. You can
    pass in an optional predicate that will be called with a parent
    node to see if a range into that parent is acceptable.
    */
    blockRange(other = this, pred) {
        if (other.pos < this.pos)
            return other.blockRange(this);
        for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
            if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
                return new NodeRange(this, other, d);
        return null;
    }
    /**
    Query whether the given position shares the same parent node.
    */
    sameParent(other) {
        return this.pos - this.parentOffset == other.pos - other.parentOffset;
    }
    /**
    Return the greater of this and the given position.
    */
    max(other) {
        return other.pos > this.pos ? other : this;
    }
    /**
    Return the smaller of this and the given position.
    */
    min(other) {
        return other.pos < this.pos ? other : this;
    }
    /**
    @internal
    */
    toString() {
        let str = "";
        for (let i = 1; i <= this.depth; i++)
            str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1);
        return str + ":" + this.parentOffset;
    }
    /**
    @internal
    */
    static resolve(doc, pos) {
        if (!(pos >= 0 && pos <= doc.content.size))
            throw new RangeError("Position " + pos + " out of range");
        let path = [];
        let start = 0, parentOffset = pos;
        for (let node = doc;;) {
            let { index, offset } = node.content.findIndex(parentOffset);
            let rem = parentOffset - offset;
            path.push(node, index, start + offset);
            if (!rem)
                break;
            node = node.child(index);
            if (node.isText)
                break;
            parentOffset = rem - 1;
            start += offset + 1;
        }
        return new ResolvedPos(pos, path, parentOffset);
    }
    /**
    @internal
    */
    static resolveCached(doc, pos) {
        let cache = resolveCache.get(doc);
        if (cache) {
            for (let i = 0; i < cache.elts.length; i++) {
                let elt = cache.elts[i];
                if (elt.pos == pos)
                    return elt;
            }
        }
        else {
            resolveCache.set(doc, cache = new ResolveCache);
        }
        let result = cache.elts[cache.i] = ResolvedPos.resolve(doc, pos);
        cache.i = (cache.i + 1) % resolveCacheSize;
        return result;
    }
}
class ResolveCache {
    constructor() {
        this.elts = [];
        this.i = 0;
    }
}
const resolveCacheSize = 12, resolveCache = new WeakMap();
/**
Represents a flat range of content, i.e. one that starts and
ends in the same node.
*/
class NodeRange {
    /**
    Construct a node range. `$from` and `$to` should point into the
    same node until at least the given `depth`, since a node range
    denotes an adjacent set of nodes in a single parent node.
    */
    constructor(
    /**
    A resolved position along the start of the content. May have a
    `depth` greater than this object's `depth` property, since
    these are the positions that were used to compute the range,
    not re-resolved positions directly at its boundaries.
    */
    $from, 
    /**
    A position along the end of the content. See
    caveat for [`$from`](https://prosemirror.net/docs/ref/#model.NodeRange.$from).
    */
    $to, 
    /**
    The depth of the node that this range points into.
    */
    depth) {
        this.$from = $from;
        this.$to = $to;
        this.depth = depth;
    }
    /**
    The position at the start of the range.
    */
    get start() { return this.$from.before(this.depth + 1); }
    /**
    The position at the end of the range.
    */
    get end() { return this.$to.after(this.depth + 1); }
    /**
    The parent node that the range points into.
    */
    get parent() { return this.$from.node(this.depth); }
    /**
    The start index of the range in the parent node.
    */
    get startIndex() { return this.$from.index(this.depth); }
    /**
    The end index of the range in the parent node.
    */
    get endIndex() { return this.$to.indexAfter(this.depth); }
}

const emptyAttrs = Object.create(null);
/**
This class represents a node in the tree that makes up a
ProseMirror document. So a document is an instance of `Node`, with
children that are also instances of `Node`.

Nodes are persistent data structures. Instead of changing them, you
create new ones with the content you want. Old ones keep pointing
at the old document shape. This is made cheaper by sharing
structure between the old and new data as much as possible, which a
tree shape like this (without back pointers) makes easy.

**Do not** directly mutate the properties of a `Node` object. See
[the guide](https://prosemirror.net/docs/guide/#doc) for more information.
*/
class Node {
    /**
    @internal
    */
    constructor(
    /**
    The type of node that this is.
    */
    type, 
    /**
    An object mapping attribute names to values. The kind of
    attributes allowed and required are
    [determined](https://prosemirror.net/docs/ref/#model.NodeSpec.attrs) by the node type.
    */
    attrs, 
    // A fragment holding the node's children.
    content, 
    /**
    The marks (things like whether it is emphasized or part of a
    link) applied to this node.
    */
    marks = Mark.none) {
        this.type = type;
        this.attrs = attrs;
        this.marks = marks;
        this.content = content || Fragment.empty;
    }
    /**
    The array of this node's child nodes.
    */
    get children() { return this.content.content; }
    /**
    The size of this node, as defined by the integer-based [indexing
    scheme](https://prosemirror.net/docs/guide/#doc.indexing). For text nodes, this is the
    amount of characters. For other leaf nodes, it is one. For
    non-leaf nodes, it is the size of the content plus two (the
    start and end token).
    */
    get nodeSize() { return this.isLeaf ? 1 : 2 + this.content.size; }
    /**
    The number of children that the node has.
    */
    get childCount() { return this.content.childCount; }
    /**
    Get the child node at the given index. Raises an error when the
    index is out of range.
    */
    child(index) { return this.content.child(index); }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) { return this.content.maybeChild(index); }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) { this.content.forEach(f); }
    /**
    Invoke a callback for all descendant nodes recursively between
    the given two positions that are relative to start of this
    node's content. The callback is invoked with the node, its
    position relative to the original node (method receiver),
    its parent node, and its child index. When the callback returns
    false for a given node, that node's children will not be
    recursed over. The last parameter can be used to specify a
    starting position to count from.
    */
    nodesBetween(from, to, f, startPos = 0) {
        this.content.nodesBetween(from, to, f, startPos, this);
    }
    /**
    Call the given callback for every descendant node. Doesn't
    descend into a node when the callback returns `false`.
    */
    descendants(f) {
        this.nodesBetween(0, this.content.size, f);
    }
    /**
    Concatenates all the text nodes found in this fragment and its
    children.
    */
    get textContent() {
        return (this.isLeaf && this.type.spec.leafText)
            ? this.type.spec.leafText(this)
            : this.textBetween(0, this.content.size, "");
    }
    /**
    Get all text between positions `from` and `to`. When
    `blockSeparator` is given, it will be inserted to separate text
    from different block nodes. If `leafText` is given, it'll be
    inserted for every non-text leaf node encountered, otherwise
    [`leafText`](https://prosemirror.net/docs/ref/#model.NodeSpec.leafText) will be used.
    */
    textBetween(from, to, blockSeparator, leafText) {
        return this.content.textBetween(from, to, blockSeparator, leafText);
    }
    /**
    Returns this node's first child, or `null` if there are no
    children.
    */
    get firstChild() { return this.content.firstChild; }
    /**
    Returns this node's last child, or `null` if there are no
    children.
    */
    get lastChild() { return this.content.lastChild; }
    /**
    Test whether two nodes represent the same piece of document.
    */
    eq(other) {
        return this == other || (this.sameMarkup(other) && this.content.eq(other.content));
    }
    /**
    Compare the markup (type, attributes, and marks) of this node to
    those of another. Returns `true` if both have the same markup.
    */
    sameMarkup(other) {
        return this.hasMarkup(other.type, other.attrs, other.marks);
    }
    /**
    Check whether this node's markup correspond to the given type,
    attributes, and marks.
    */
    hasMarkup(type, attrs, marks) {
        return this.type == type &&
            compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
            Mark.sameSet(this.marks, marks || Mark.none);
    }
    /**
    Create a new node with the same markup as this node, containing
    the given content (or empty, if no content is given).
    */
    copy(content = null) {
        if (content == this.content)
            return this;
        return new Node(this.type, this.attrs, content, this.marks);
    }
    /**
    Create a copy of this node, with the given set of marks instead
    of the node's own marks.
    */
    mark(marks) {
        return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks);
    }
    /**
    Create a copy of this node with only the content between the
    given positions. If `to` is not given, it defaults to the end of
    the node.
    */
    cut(from, to = this.content.size) {
        if (from == 0 && to == this.content.size)
            return this;
        return this.copy(this.content.cut(from, to));
    }
    /**
    Cut out the part of the document between the given positions, and
    return it as a `Slice` object.
    */
    slice(from, to = this.content.size, includeParents = false) {
        if (from == to)
            return Slice.empty;
        let $from = this.resolve(from), $to = this.resolve(to);
        let depth = includeParents ? 0 : $from.sharedDepth(to);
        let start = $from.start(depth), node = $from.node(depth);
        let content = node.content.cut($from.pos - start, $to.pos - start);
        return new Slice(content, $from.depth - depth, $to.depth - depth);
    }
    /**
    Replace the part of the document between the given positions with
    the given slice. The slice must 'fit', meaning its open sides
    must be able to connect to the surrounding content, and its
    content nodes must be valid children for the node they are placed
    into. If any of this is violated, an error of type
    [`ReplaceError`](https://prosemirror.net/docs/ref/#model.ReplaceError) is thrown.
    */
    replace(from, to, slice) {
        return replace(this.resolve(from), this.resolve(to), slice);
    }
    /**
    Find the node directly after the given position.
    */
    nodeAt(pos) {
        for (let node = this;;) {
            let { index, offset } = node.content.findIndex(pos);
            node = node.maybeChild(index);
            if (!node)
                return null;
            if (offset == pos || node.isText)
                return node;
            pos -= offset + 1;
        }
    }
    /**
    Find the (direct) child node after the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childAfter(pos) {
        let { index, offset } = this.content.findIndex(pos);
        return { node: this.content.maybeChild(index), index, offset };
    }
    /**
    Find the (direct) child node before the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childBefore(pos) {
        if (pos == 0)
            return { node: null, index: 0, offset: 0 };
        let { index, offset } = this.content.findIndex(pos);
        if (offset < pos)
            return { node: this.content.child(index), index, offset };
        let node = this.content.child(index - 1);
        return { node, index: index - 1, offset: offset - node.nodeSize };
    }
    /**
    Resolve the given position in the document, returning an
    [object](https://prosemirror.net/docs/ref/#model.ResolvedPos) with information about its context.
    */
    resolve(pos) { return ResolvedPos.resolveCached(this, pos); }
    /**
    @internal
    */
    resolveNoCache(pos) { return ResolvedPos.resolve(this, pos); }
    /**
    Test whether a given mark or mark type occurs in this document
    between the two given positions.
    */
    rangeHasMark(from, to, type) {
        let found = false;
        if (to > from)
            this.nodesBetween(from, to, node => {
                if (type.isInSet(node.marks))
                    found = true;
                return !found;
            });
        return found;
    }
    /**
    True when this is a block (non-inline node)
    */
    get isBlock() { return this.type.isBlock; }
    /**
    True when this is a textblock node, a block node with inline
    content.
    */
    get isTextblock() { return this.type.isTextblock; }
    /**
    True when this node allows inline content.
    */
    get inlineContent() { return this.type.inlineContent; }
    /**
    True when this is an inline node (a text node or a node that can
    appear among text).
    */
    get isInline() { return this.type.isInline; }
    /**
    True when this is a text node.
    */
    get isText() { return this.type.isText; }
    /**
    True when this is a leaf node.
    */
    get isLeaf() { return this.type.isLeaf; }
    /**
    True when this is an atom, i.e. when it does not have directly
    editable content. This is usually the same as `isLeaf`, but can
    be configured with the [`atom` property](https://prosemirror.net/docs/ref/#model.NodeSpec.atom)
    on a node's spec (typically used when the node is displayed as
    an uneditable [node view](https://prosemirror.net/docs/ref/#view.NodeView)).
    */
    get isAtom() { return this.type.isAtom; }
    /**
    Return a string representation of this node for debugging
    purposes.
    */
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        let name = this.type.name;
        if (this.content.size)
            name += "(" + this.content.toStringInner() + ")";
        return wrapMarks(this.marks, name);
    }
    /**
    Get the content match in this node at the given index.
    */
    contentMatchAt(index) {
        let match = this.type.contentMatch.matchFragment(this.content, 0, index);
        if (!match)
            throw new Error("Called contentMatchAt on a node with invalid content");
        return match;
    }
    /**
    Test whether replacing the range between `from` and `to` (by
    child index) with the given replacement fragment (which defaults
    to the empty fragment) would leave the node's content valid. You
    can optionally pass `start` and `end` indices into the
    replacement fragment.
    */
    canReplace(from, to, replacement = Fragment.empty, start = 0, end = replacement.childCount) {
        let one = this.contentMatchAt(from).matchFragment(replacement, start, end);
        let two = one && one.matchFragment(this.content, to);
        if (!two || !two.validEnd)
            return false;
        for (let i = start; i < end; i++)
            if (!this.type.allowsMarks(replacement.child(i).marks))
                return false;
        return true;
    }
    /**
    Test whether replacing the range `from` to `to` (by index) with
    a node of the given type would leave the node's content valid.
    */
    canReplaceWith(from, to, type, marks) {
        if (marks && !this.type.allowsMarks(marks))
            return false;
        let start = this.contentMatchAt(from).matchType(type);
        let end = start && start.matchFragment(this.content, to);
        return end ? end.validEnd : false;
    }
    /**
    Test whether the given node's content could be appended to this
    node. If that node is empty, this will only return true if there
    is at least one node type that can appear in both nodes (to avoid
    merging completely incompatible nodes).
    */
    canAppend(other) {
        if (other.content.size)
            return this.canReplace(this.childCount, this.childCount, other.content);
        else
            return this.type.compatibleContent(other.type);
    }
    /**
    Check whether this node and its descendants conform to the
    schema, and raise an exception when they do not.
    */
    check() {
        this.type.checkContent(this.content);
        this.type.checkAttrs(this.attrs);
        let copy = Mark.none;
        for (let i = 0; i < this.marks.length; i++) {
            let mark = this.marks[i];
            mark.type.checkAttrs(mark.attrs);
            copy = mark.addToSet(copy);
        }
        if (!Mark.sameSet(copy, this.marks))
            throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`);
        this.content.forEach(node => node.check());
    }
    /**
    Return a JSON-serializeable representation of this node.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        if (this.content.size)
            obj.content = this.content.toJSON();
        if (this.marks.length)
            obj.marks = this.marks.map(n => n.toJSON());
        return obj;
    }
    /**
    Deserialize a node from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Node.fromJSON");
        let marks = undefined;
        if (json.marks) {
            if (!Array.isArray(json.marks))
                throw new RangeError("Invalid mark data for Node.fromJSON");
            marks = json.marks.map(schema.markFromJSON);
        }
        if (json.type == "text") {
            if (typeof json.text != "string")
                throw new RangeError("Invalid text node in JSON");
            return schema.text(json.text, marks);
        }
        let content = Fragment.fromJSON(schema, json.content);
        let node = schema.nodeType(json.type).create(json.attrs, content, marks);
        node.type.checkAttrs(node.attrs);
        return node;
    }
}
Node.prototype.text = undefined;
class TextNode extends Node {
    /**
    @internal
    */
    constructor(type, attrs, content, marks) {
        super(type, attrs, null, marks);
        if (!content)
            throw new RangeError("Empty text nodes are not allowed");
        this.text = content;
    }
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        return wrapMarks(this.marks, JSON.stringify(this.text));
    }
    get textContent() { return this.text; }
    textBetween(from, to) { return this.text.slice(from, to); }
    get nodeSize() { return this.text.length; }
    mark(marks) {
        return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks);
    }
    withText(text) {
        if (text == this.text)
            return this;
        return new TextNode(this.type, this.attrs, text, this.marks);
    }
    cut(from = 0, to = this.text.length) {
        if (from == 0 && to == this.text.length)
            return this;
        return this.withText(this.text.slice(from, to));
    }
    eq(other) {
        return this.sameMarkup(other) && this.text == other.text;
    }
    toJSON() {
        let base = super.toJSON();
        base.text = this.text;
        return base;
    }
}
function wrapMarks(marks, str) {
    for (let i = marks.length - 1; i >= 0; i--)
        str = marks[i].type.name + "(" + str + ")";
    return str;
}

/**
Instances of this class represent a match state of a node type's
[content expression](https://prosemirror.net/docs/ref/#model.NodeSpec.content), and can be used to
find out whether further content matches here, and whether a given
position is a valid end of the node.
*/
class ContentMatch {
    /**
    @internal
    */
    constructor(
    /**
    True when this match state represents a valid end of the node.
    */
    validEnd) {
        this.validEnd = validEnd;
        /**
        @internal
        */
        this.next = [];
        /**
        @internal
        */
        this.wrapCache = [];
    }
    /**
    @internal
    */
    static parse(string, nodeTypes) {
        let stream = new TokenStream(string, nodeTypes);
        if (stream.next == null)
            return ContentMatch.empty;
        let expr = parseExpr(stream);
        if (stream.next)
            stream.err("Unexpected trailing text");
        let match = dfa(nfa(expr));
        checkForDeadEnds(match, stream);
        return match;
    }
    /**
    Match a node type, returning a match after that node if
    successful.
    */
    matchType(type) {
        for (let i = 0; i < this.next.length; i++)
            if (this.next[i].type == type)
                return this.next[i].next;
        return null;
    }
    /**
    Try to match a fragment. Returns the resulting match when
    successful.
    */
    matchFragment(frag, start = 0, end = frag.childCount) {
        let cur = this;
        for (let i = start; cur && i < end; i++)
            cur = cur.matchType(frag.child(i).type);
        return cur;
    }
    /**
    @internal
    */
    get inlineContent() {
        return this.next.length != 0 && this.next[0].type.isInline;
    }
    /**
    Get the first matching node type at this match position that can
    be generated.
    */
    get defaultType() {
        for (let i = 0; i < this.next.length; i++) {
            let { type } = this.next[i];
            if (!(type.isText || type.hasRequiredAttrs()))
                return type;
        }
        return null;
    }
    /**
    @internal
    */
    compatible(other) {
        for (let i = 0; i < this.next.length; i++)
            for (let j = 0; j < other.next.length; j++)
                if (this.next[i].type == other.next[j].type)
                    return true;
        return false;
    }
    /**
    Try to match the given fragment, and if that fails, see if it can
    be made to match by inserting nodes in front of it. When
    successful, return a fragment of inserted nodes (which may be
    empty if nothing had to be inserted). When `toEnd` is true, only
    return a fragment if the resulting match goes to the end of the
    content expression.
    */
    fillBefore(after, toEnd = false, startIndex = 0) {
        let seen = [this];
        function search(match, types) {
            let finished = match.matchFragment(after, startIndex);
            if (finished && (!toEnd || finished.validEnd))
                return Fragment.from(types.map(tp => tp.createAndFill()));
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
                    seen.push(next);
                    let found = search(next, types.concat(type));
                    if (found)
                        return found;
                }
            }
            return null;
        }
        return search(this, []);
    }
    /**
    Find a set of wrapping node types that would allow a node of the
    given type to appear at this position. The result may be empty
    (when it fits directly) and will be null when no such wrapping
    exists.
    */
    findWrapping(target) {
        for (let i = 0; i < this.wrapCache.length; i += 2)
            if (this.wrapCache[i] == target)
                return this.wrapCache[i + 1];
        let computed = this.computeWrapping(target);
        this.wrapCache.push(target, computed);
        return computed;
    }
    /**
    @internal
    */
    computeWrapping(target) {
        let seen = Object.create(null), active = [{ match: this, type: null, via: null }];
        while (active.length) {
            let current = active.shift(), match = current.match;
            if (match.matchType(target)) {
                let result = [];
                for (let obj = current; obj.type; obj = obj.via)
                    result.push(obj.type);
                return result.reverse();
            }
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
                    active.push({ match: type.contentMatch, type, via: current });
                    seen[type.name] = true;
                }
            }
        }
        return null;
    }
    /**
    The number of outgoing edges this node has in the finite
    automaton that describes the content expression.
    */
    get edgeCount() {
        return this.next.length;
    }
    /**
    Get the _n_​th outgoing edge from this node in the finite
    automaton that describes the content expression.
    */
    edge(n) {
        if (n >= this.next.length)
            throw new RangeError(`There's no ${n}th edge in this content match`);
        return this.next[n];
    }
    /**
    @internal
    */
    toString() {
        let seen = [];
        function scan(m) {
            seen.push(m);
            for (let i = 0; i < m.next.length; i++)
                if (seen.indexOf(m.next[i].next) == -1)
                    scan(m.next[i].next);
        }
        scan(this);
        return seen.map((m, i) => {
            let out = i + (m.validEnd ? "*" : " ") + " ";
            for (let i = 0; i < m.next.length; i++)
                out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next);
            return out;
        }).join("\n");
    }
}
/**
@internal
*/
ContentMatch.empty = new ContentMatch(true);
class TokenStream {
    constructor(string, nodeTypes) {
        this.string = string;
        this.nodeTypes = nodeTypes;
        this.inline = null;
        this.pos = 0;
        this.tokens = string.split(/\s*(?=\b|\W|$)/);
        if (this.tokens[this.tokens.length - 1] == "")
            this.tokens.pop();
        if (this.tokens[0] == "")
            this.tokens.shift();
    }
    get next() { return this.tokens[this.pos]; }
    eat(tok) { return this.next == tok && (this.pos++ || true); }
    err(str) { throw new SyntaxError(str + " (in content expression '" + this.string + "')"); }
}
function parseExpr(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSeq(stream));
    } while (stream.eat("|"));
    return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
}
function parseExprSeq(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSubscript(stream));
    } while (stream.next && stream.next != ")" && stream.next != "|");
    return exprs.length == 1 ? exprs[0] : { type: "seq", exprs };
}
function parseExprSubscript(stream) {
    let expr = parseExprAtom(stream);
    for (;;) {
        if (stream.eat("+"))
            expr = { type: "plus", expr };
        else if (stream.eat("*"))
            expr = { type: "star", expr };
        else if (stream.eat("?"))
            expr = { type: "opt", expr };
        else if (stream.eat("{"))
            expr = parseExprRange(stream, expr);
        else
            break;
    }
    return expr;
}
function parseNum(stream) {
    if (/\D/.test(stream.next))
        stream.err("Expected number, got '" + stream.next + "'");
    let result = Number(stream.next);
    stream.pos++;
    return result;
}
function parseExprRange(stream, expr) {
    let min = parseNum(stream), max = min;
    if (stream.eat(",")) {
        if (stream.next != "}")
            max = parseNum(stream);
        else
            max = -1;
    }
    if (!stream.eat("}"))
        stream.err("Unclosed braced range");
    return { type: "range", min, max, expr };
}
function resolveName(stream, name) {
    let types = stream.nodeTypes, type = types[name];
    if (type)
        return [type];
    let result = [];
    for (let typeName in types) {
        let type = types[typeName];
        if (type.isInGroup(name))
            result.push(type);
    }
    if (result.length == 0)
        stream.err("No node type or group '" + name + "' found");
    return result;
}
function parseExprAtom(stream) {
    if (stream.eat("(")) {
        let expr = parseExpr(stream);
        if (!stream.eat(")"))
            stream.err("Missing closing paren");
        return expr;
    }
    else if (!/\W/.test(stream.next)) {
        let exprs = resolveName(stream, stream.next).map(type => {
            if (stream.inline == null)
                stream.inline = type.isInline;
            else if (stream.inline != type.isInline)
                stream.err("Mixing inline and block content");
            return { type: "name", value: type };
        });
        stream.pos++;
        return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
    }
    else {
        stream.err("Unexpected token '" + stream.next + "'");
    }
}
// Construct an NFA from an expression as returned by the parser. The
// NFA is represented as an array of states, which are themselves
// arrays of edges, which are `{term, to}` objects. The first state is
// the entry state and the last node is the success state.
//
// Note that unlike typical NFAs, the edge ordering in this one is
// significant, in that it is used to contruct filler content when
// necessary.
function nfa(expr) {
    let nfa = [[]];
    connect(compile(expr, 0), node());
    return nfa;
    function node() { return nfa.push([]) - 1; }
    function edge(from, to, term) {
        let edge = { term, to };
        nfa[from].push(edge);
        return edge;
    }
    function connect(edges, to) {
        edges.forEach(edge => edge.to = to);
    }
    function compile(expr, from) {
        if (expr.type == "choice") {
            return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), []);
        }
        else if (expr.type == "seq") {
            for (let i = 0;; i++) {
                let next = compile(expr.exprs[i], from);
                if (i == expr.exprs.length - 1)
                    return next;
                connect(next, from = node());
            }
        }
        else if (expr.type == "star") {
            let loop = node();
            edge(from, loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "plus") {
            let loop = node();
            connect(compile(expr.expr, from), loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "opt") {
            return [edge(from)].concat(compile(expr.expr, from));
        }
        else if (expr.type == "range") {
            let cur = from;
            for (let i = 0; i < expr.min; i++) {
                let next = node();
                connect(compile(expr.expr, cur), next);
                cur = next;
            }
            if (expr.max == -1) {
                connect(compile(expr.expr, cur), cur);
            }
            else {
                for (let i = expr.min; i < expr.max; i++) {
                    let next = node();
                    edge(cur, next);
                    connect(compile(expr.expr, cur), next);
                    cur = next;
                }
            }
            return [edge(cur)];
        }
        else if (expr.type == "name") {
            return [edge(from, undefined, expr.value)];
        }
        else {
            throw new Error("Unknown expr type");
        }
    }
}
function cmp(a, b) { return b - a; }
// Get the set of nodes reachable by null edges from `node`. Omit
// nodes with only a single null-out-edge, since they may lead to
// needless duplicated nodes.
function nullFrom(nfa, node) {
    let result = [];
    scan(node);
    return result.sort(cmp);
    function scan(node) {
        let edges = nfa[node];
        if (edges.length == 1 && !edges[0].term)
            return scan(edges[0].to);
        result.push(node);
        for (let i = 0; i < edges.length; i++) {
            let { term, to } = edges[i];
            if (!term && result.indexOf(to) == -1)
                scan(to);
        }
    }
}
// Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
// of state objects (`ContentMatch` instances) with transitions
// between them.
function dfa(nfa) {
    let labeled = Object.create(null);
    return explore(nullFrom(nfa, 0));
    function explore(states) {
        let out = [];
        states.forEach(node => {
            nfa[node].forEach(({ term, to }) => {
                if (!term)
                    return;
                let set;
                for (let i = 0; i < out.length; i++)
                    if (out[i][0] == term)
                        set = out[i][1];
                nullFrom(nfa, to).forEach(node => {
                    if (!set)
                        out.push([term, set = []]);
                    if (set.indexOf(node) == -1)
                        set.push(node);
                });
            });
        });
        let state = labeled[states.join(",")] = new ContentMatch(states.indexOf(nfa.length - 1) > -1);
        for (let i = 0; i < out.length; i++) {
            let states = out[i][1].sort(cmp);
            state.next.push({ type: out[i][0], next: labeled[states.join(",")] || explore(states) });
        }
        return state;
    }
}
function checkForDeadEnds(match, stream) {
    for (let i = 0, work = [match]; i < work.length; i++) {
        let state = work[i], dead = !state.validEnd, nodes = [];
        for (let j = 0; j < state.next.length; j++) {
            let { type, next } = state.next[j];
            nodes.push(type.name);
            if (dead && !(type.isText || type.hasRequiredAttrs()))
                dead = false;
            if (work.indexOf(next) == -1)
                work.push(next);
        }
        if (dead)
            stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)");
    }
}

// For node types where all attrs have a default value (or which don't
// have any attributes), build up a single reusable default attribute
// object, and use it for all nodes that don't specify specific
// attributes.
function defaultAttrs(attrs) {
    let defaults = Object.create(null);
    for (let attrName in attrs) {
        let attr = attrs[attrName];
        if (!attr.hasDefault)
            return null;
        defaults[attrName] = attr.default;
    }
    return defaults;
}
function computeAttrs(attrs, value) {
    let built = Object.create(null);
    for (let name in attrs) {
        let given = value && value[name];
        if (given === undefined) {
            let attr = attrs[name];
            if (attr.hasDefault)
                given = attr.default;
            else
                throw new RangeError("No value supplied for attribute " + name);
        }
        built[name] = given;
    }
    return built;
}
function checkAttrs(attrs, values, type, name) {
    for (let name in values)
        if (!(name in attrs))
            throw new RangeError(`Unsupported attribute ${name} for ${type} of type ${name}`);
    for (let name in attrs) {
        let attr = attrs[name];
        if (attr.validate)
            attr.validate(values[name]);
    }
}
function initAttrs(typeName, attrs) {
    let result = Object.create(null);
    if (attrs)
        for (let name in attrs)
            result[name] = new Attribute(typeName, name, attrs[name]);
    return result;
}
/**
Node types are objects allocated once per `Schema` and used to
[tag](https://prosemirror.net/docs/ref/#model.Node.type) `Node` instances. They contain information
about the node type, such as its name and what kind of node it
represents.
*/
class NodeType {
    /**
    @internal
    */
    constructor(
    /**
    The name the node type has in this schema.
    */
    name, 
    /**
    A link back to the `Schema` the node type belongs to.
    */
    schema, 
    /**
    The spec that this type is based on
    */
    spec) {
        this.name = name;
        this.schema = schema;
        this.spec = spec;
        /**
        The set of marks allowed in this node. `null` means all marks
        are allowed.
        */
        this.markSet = null;
        this.groups = spec.group ? spec.group.split(" ") : [];
        this.attrs = initAttrs(name, spec.attrs);
        this.defaultAttrs = defaultAttrs(this.attrs);
        this.contentMatch = null;
        this.inlineContent = null;
        this.isBlock = !(spec.inline || name == "text");
        this.isText = name == "text";
    }
    /**
    True if this is an inline type.
    */
    get isInline() { return !this.isBlock; }
    /**
    True if this is a textblock type, a block that contains inline
    content.
    */
    get isTextblock() { return this.isBlock && this.inlineContent; }
    /**
    True for node types that allow no content.
    */
    get isLeaf() { return this.contentMatch == ContentMatch.empty; }
    /**
    True when this node is an atom, i.e. when it does not have
    directly editable content.
    */
    get isAtom() { return this.isLeaf || !!this.spec.atom; }
    /**
    Return true when this node type is part of the given
    [group](https://prosemirror.net/docs/ref/#model.NodeSpec.group).
    */
    isInGroup(group) {
        return this.groups.indexOf(group) > -1;
    }
    /**
    The node type's [whitespace](https://prosemirror.net/docs/ref/#model.NodeSpec.whitespace) option.
    */
    get whitespace() {
        return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
    }
    /**
    Tells you whether this node type has any required attributes.
    */
    hasRequiredAttrs() {
        for (let n in this.attrs)
            if (this.attrs[n].isRequired)
                return true;
        return false;
    }
    /**
    Indicates whether this node allows some of the same content as
    the given node type.
    */
    compatibleContent(other) {
        return this == other || this.contentMatch.compatible(other.contentMatch);
    }
    /**
    @internal
    */
    computeAttrs(attrs) {
        if (!attrs && this.defaultAttrs)
            return this.defaultAttrs;
        else
            return computeAttrs(this.attrs, attrs);
    }
    /**
    Create a `Node` of this type. The given attributes are
    checked and defaulted (you can pass `null` to use the type's
    defaults entirely, if no required attributes exist). `content`
    may be a `Fragment`, a node, an array of nodes, or
    `null`. Similarly `marks` may be `null` to default to the empty
    set of marks.
    */
    create(attrs = null, content, marks) {
        if (this.isText)
            throw new Error("NodeType.create can't construct text nodes");
        return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but check the given content
    against the node type's content restrictions, and throw an error
    if it doesn't match.
    */
    createChecked(attrs = null, content, marks) {
        content = Fragment.from(content);
        this.checkContent(content);
        return new Node(this, this.computeAttrs(attrs), content, Mark.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but see if it is
    necessary to add nodes to the start or end of the given fragment
    to make it fit the node. If no fitting wrapping can be found,
    return null. Note that, due to the fact that required nodes can
    always be created, this will always succeed if you pass null or
    `Fragment.empty` as content.
    */
    createAndFill(attrs = null, content, marks) {
        attrs = this.computeAttrs(attrs);
        content = Fragment.from(content);
        if (content.size) {
            let before = this.contentMatch.fillBefore(content);
            if (!before)
                return null;
            content = before.append(content);
        }
        let matched = this.contentMatch.matchFragment(content);
        let after = matched && matched.fillBefore(Fragment.empty, true);
        if (!after)
            return null;
        return new Node(this, attrs, content.append(after), Mark.setFrom(marks));
    }
    /**
    Returns true if the given fragment is valid content for this node
    type.
    */
    validContent(content) {
        let result = this.contentMatch.matchFragment(content);
        if (!result || !result.validEnd)
            return false;
        for (let i = 0; i < content.childCount; i++)
            if (!this.allowsMarks(content.child(i).marks))
                return false;
        return true;
    }
    /**
    Throws a RangeError if the given fragment is not valid content for this
    node type.
    @internal
    */
    checkContent(content) {
        if (!this.validContent(content))
            throw new RangeError(`Invalid content for node ${this.name}: ${content.toString().slice(0, 50)}`);
    }
    /**
    @internal
    */
    checkAttrs(attrs) {
        checkAttrs(this.attrs, attrs, "node", this.name);
    }
    /**
    Check whether the given mark type is allowed in this node.
    */
    allowsMarkType(markType) {
        return this.markSet == null || this.markSet.indexOf(markType) > -1;
    }
    /**
    Test whether the given set of marks are allowed in this node.
    */
    allowsMarks(marks) {
        if (this.markSet == null)
            return true;
        for (let i = 0; i < marks.length; i++)
            if (!this.allowsMarkType(marks[i].type))
                return false;
        return true;
    }
    /**
    Removes the marks that are not allowed in this node from the given set.
    */
    allowedMarks(marks) {
        if (this.markSet == null)
            return marks;
        let copy;
        for (let i = 0; i < marks.length; i++) {
            if (!this.allowsMarkType(marks[i].type)) {
                if (!copy)
                    copy = marks.slice(0, i);
            }
            else if (copy) {
                copy.push(marks[i]);
            }
        }
        return !copy ? marks : copy.length ? copy : Mark.none;
    }
    /**
    @internal
    */
    static compile(nodes, schema) {
        let result = Object.create(null);
        nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec));
        let topType = schema.spec.topNode || "doc";
        if (!result[topType])
            throw new RangeError("Schema is missing its top node type ('" + topType + "')");
        if (!result.text)
            throw new RangeError("Every schema needs a 'text' type");
        for (let _ in result.text.attrs)
            throw new RangeError("The text node type should not have attributes");
        return result;
    }
}
function validateType(typeName, attrName, type) {
    let types = type.split("|");
    return (value) => {
        let name = value === null ? "null" : typeof value;
        if (types.indexOf(name) < 0)
            throw new RangeError(`Expected value of type ${types} for attribute ${attrName} on type ${typeName}, got ${name}`);
    };
}
// Attribute descriptors
class Attribute {
    constructor(typeName, attrName, options) {
        this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
        this.default = options.default;
        this.validate = typeof options.validate == "string" ? validateType(typeName, attrName, options.validate) : options.validate;
    }
    get isRequired() {
        return !this.hasDefault;
    }
}
// Marks
/**
Like nodes, marks (which are associated with nodes to signify
things like emphasis or being part of a link) are
[tagged](https://prosemirror.net/docs/ref/#model.Mark.type) with type objects, which are
instantiated once per `Schema`.
*/
class MarkType {
    /**
    @internal
    */
    constructor(
    /**
    The name of the mark type.
    */
    name, 
    /**
    @internal
    */
    rank, 
    /**
    The schema that this mark type instance is part of.
    */
    schema, 
    /**
    The spec on which the type is based.
    */
    spec) {
        this.name = name;
        this.rank = rank;
        this.schema = schema;
        this.spec = spec;
        this.attrs = initAttrs(name, spec.attrs);
        this.excluded = null;
        let defaults = defaultAttrs(this.attrs);
        this.instance = defaults ? new Mark(this, defaults) : null;
    }
    /**
    Create a mark of this type. `attrs` may be `null` or an object
    containing only some of the mark's attributes. The others, if
    they have defaults, will be added.
    */
    create(attrs = null) {
        if (!attrs && this.instance)
            return this.instance;
        return new Mark(this, computeAttrs(this.attrs, attrs));
    }
    /**
    @internal
    */
    static compile(marks, schema) {
        let result = Object.create(null), rank = 0;
        marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec));
        return result;
    }
    /**
    When there is a mark of this type in the given set, a new set
    without it is returned. Otherwise, the input set is returned.
    */
    removeFromSet(set) {
        for (var i = 0; i < set.length; i++)
            if (set[i].type == this) {
                set = set.slice(0, i).concat(set.slice(i + 1));
                i--;
            }
        return set;
    }
    /**
    Tests whether there is a mark of this type in the given set.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (set[i].type == this)
                return set[i];
    }
    /**
    @internal
    */
    checkAttrs(attrs) {
        checkAttrs(this.attrs, attrs, "mark", this.name);
    }
    /**
    Queries whether a given mark type is
    [excluded](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) by this one.
    */
    excludes(other) {
        return this.excluded.indexOf(other) > -1;
    }
}
/**
A document schema. Holds [node](https://prosemirror.net/docs/ref/#model.NodeType) and [mark
type](https://prosemirror.net/docs/ref/#model.MarkType) objects for the nodes and marks that may
occur in conforming documents, and provides functionality for
creating and deserializing such documents.

When given, the type parameters provide the names of the nodes and
marks in this schema.
*/
class Schema {
    /**
    Construct a schema from a schema [specification](https://prosemirror.net/docs/ref/#model.SchemaSpec).
    */
    constructor(spec) {
        /**
        The [linebreak
        replacement](https://prosemirror.net/docs/ref/#model.NodeSpec.linebreakReplacement) node defined
        in this schema, if any.
        */
        this.linebreakReplacement = null;
        /**
        An object for storing whatever values modules may want to
        compute and cache per schema. (If you want to store something
        in it, try to use property names unlikely to clash.)
        */
        this.cached = Object.create(null);
        let instanceSpec = this.spec = {};
        for (let prop in spec)
            instanceSpec[prop] = spec[prop];
        instanceSpec.nodes = OrderedMap.from(spec.nodes),
            instanceSpec.marks = OrderedMap.from(spec.marks || {}),
            this.nodes = NodeType.compile(this.spec.nodes, this);
        this.marks = MarkType.compile(this.spec.marks, this);
        let contentExprCache = Object.create(null);
        for (let prop in this.nodes) {
            if (prop in this.marks)
                throw new RangeError(prop + " can not be both a node and a mark");
            let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks;
            type.contentMatch = contentExprCache[contentExpr] ||
                (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes));
            type.inlineContent = type.contentMatch.inlineContent;
            if (type.spec.linebreakReplacement) {
                if (this.linebreakReplacement)
                    throw new RangeError("Multiple linebreak nodes defined");
                if (!type.isInline || !type.isLeaf)
                    throw new RangeError("Linebreak replacement nodes must be inline leaf nodes");
                this.linebreakReplacement = type;
            }
            type.markSet = markExpr == "_" ? null :
                markExpr ? gatherMarks(this, markExpr.split(" ")) :
                    markExpr == "" || !type.inlineContent ? [] : null;
        }
        for (let prop in this.marks) {
            let type = this.marks[prop], excl = type.spec.excludes;
            type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "));
        }
        this.nodeFromJSON = json => Node.fromJSON(this, json);
        this.markFromJSON = json => Mark.fromJSON(this, json);
        this.topNodeType = this.nodes[this.spec.topNode || "doc"];
        this.cached.wrappings = Object.create(null);
    }
    /**
    Create a node in this schema. The `type` may be a string or a
    `NodeType` instance. Attributes will be extended with defaults,
    `content` may be a `Fragment`, `null`, a `Node`, or an array of
    nodes.
    */
    node(type, attrs = null, content, marks) {
        if (typeof type == "string")
            type = this.nodeType(type);
        else if (!(type instanceof NodeType))
            throw new RangeError("Invalid node type: " + type);
        else if (type.schema != this)
            throw new RangeError("Node type from different schema used (" + type.name + ")");
        return type.createChecked(attrs, content, marks);
    }
    /**
    Create a text node in the schema. Empty text nodes are not
    allowed.
    */
    text(text, marks) {
        let type = this.nodes.text;
        return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
    }
    /**
    Create a mark with the given type and attributes.
    */
    mark(type, attrs) {
        if (typeof type == "string")
            type = this.marks[type];
        return type.create(attrs);
    }
    /**
    @internal
    */
    nodeType(name) {
        let found = this.nodes[name];
        if (!found)
            throw new RangeError("Unknown node type: " + name);
        return found;
    }
}
function gatherMarks(schema, marks) {
    let found = [];
    for (let i = 0; i < marks.length; i++) {
        let name = marks[i], mark = schema.marks[name], ok = mark;
        if (mark) {
            found.push(mark);
        }
        else {
            for (let prop in schema.marks) {
                let mark = schema.marks[prop];
                if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
                    found.push(ok = mark);
            }
        }
        if (!ok)
            throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
    }
    return found;
}

// Recovery values encode a range index and an offset. They are
// represented as numbers, because tons of them will be created when
// mapping, for example, a large number of decorations. The number's
// lower 16 bits provide the index, the remaining bits the offset.
//
// Note: We intentionally don't use bit shift operators to en- and
// decode these, since those clip to 32 bits, which we might in rare
// cases want to overflow. A 64-bit float can represent 48-bit
// integers precisely.
const lower16 = 0xffff;
const factor16 = Math.pow(2, 16);
function makeRecover(index, offset) { return index + offset * factor16; }
function recoverIndex(value) { return value & lower16; }
function recoverOffset(value) { return (value - (value & lower16)) / factor16; }
const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8;
/**
An object representing a mapped position with extra
information.
*/
class MapResult {
    /**
    @internal
    */
    constructor(
    /**
    The mapped version of the position.
    */
    pos, 
    /**
    @internal
    */
    delInfo, 
    /**
    @internal
    */
    recover) {
        this.pos = pos;
        this.delInfo = delInfo;
        this.recover = recover;
    }
    /**
    Tells you whether the position was deleted, that is, whether the
    step removed the token on the side queried (via the `assoc`)
    argument from the document.
    */
    get deleted() { return (this.delInfo & DEL_SIDE) > 0; }
    /**
    Tells you whether the token before the mapped position was deleted.
    */
    get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0; }
    /**
    True when the token after the mapped position was deleted.
    */
    get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0; }
    /**
    Tells whether any of the steps mapped through deletes across the
    position (including both the token before and after the
    position).
    */
    get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0; }
}
/**
A map describing the deletions and insertions made by a step, which
can be used to find the correspondence between positions in the
pre-step version of a document and the same position in the
post-step version.
*/
class StepMap {
    /**
    Create a position map. The modifications to the document are
    represented as an array of numbers, in which each group of three
    represents a modified chunk as `[start, oldSize, newSize]`.
    */
    constructor(
    /**
    @internal
    */
    ranges, 
    /**
    @internal
    */
    inverted = false) {
        this.ranges = ranges;
        this.inverted = inverted;
        if (!ranges.length && StepMap.empty)
            return StepMap.empty;
    }
    /**
    @internal
    */
    recover(value) {
        let diff = 0, index = recoverIndex(value);
        if (!this.inverted)
            for (let i = 0; i < index; i++)
                diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
        return this.ranges[index * 3] + diff + recoverOffset(value);
    }
    mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
    map(pos, assoc = 1) { return this._map(pos, assoc, true); }
    /**
    @internal
    */
    _map(pos, assoc, simple) {
        let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i] - (this.inverted ? diff : 0);
            if (start > pos)
                break;
            let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize;
            if (pos <= end) {
                let side = !oldSize ? assoc : pos == start ? -1 : pos == end ? 1 : assoc;
                let result = start + diff + (side < 0 ? 0 : newSize);
                if (simple)
                    return result;
                let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start);
                let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS;
                if (assoc < 0 ? pos != start : pos != end)
                    del |= DEL_SIDE;
                return new MapResult(result, del, recover);
            }
            diff += newSize - oldSize;
        }
        return simple ? pos + diff : new MapResult(pos + diff, 0, null);
    }
    /**
    @internal
    */
    touches(pos, recover) {
        let diff = 0, index = recoverIndex(recover);
        let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i] - (this.inverted ? diff : 0);
            if (start > pos)
                break;
            let oldSize = this.ranges[i + oldIndex], end = start + oldSize;
            if (pos <= end && i == index * 3)
                return true;
            diff += this.ranges[i + newIndex] - oldSize;
        }
        return false;
    }
    /**
    Calls the given function on each of the changed ranges included in
    this map.
    */
    forEach(f) {
        let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff);
            let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex];
            f(oldStart, oldStart + oldSize, newStart, newStart + newSize);
            diff += newSize - oldSize;
        }
    }
    /**
    Create an inverted version of this map. The result can be used to
    map positions in the post-step document to the pre-step document.
    */
    invert() {
        return new StepMap(this.ranges, !this.inverted);
    }
    /**
    @internal
    */
    toString() {
        return (this.inverted ? "-" : "") + JSON.stringify(this.ranges);
    }
    /**
    Create a map that moves all positions by offset `n` (which may be
    negative). This can be useful when applying steps meant for a
    sub-document to a larger document, or vice-versa.
    */
    static offset(n) {
        return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
    }
}
/**
A StepMap that contains no changed ranges.
*/
StepMap.empty = new StepMap([]);

const stepsByID = Object.create(null);
/**
A step object represents an atomic change. It generally applies
only to the document it was created for, since the positions
stored in it will only make sense for that document.

New steps are defined by creating classes that extend `Step`,
overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
methods, and registering your class with a unique
JSON-serialization identifier using
[`Step.jsonID`](https://prosemirror.net/docs/ref/#transform.Step^jsonID).
*/
class Step {
    /**
    Get the step map that represents the changes made by this step,
    and which can be used to transform between positions in the old
    and the new document.
    */
    getMap() { return StepMap.empty; }
    /**
    Try to merge this step with another one, to be applied directly
    after it. Returns the merged step when possible, null if the
    steps can't be merged.
    */
    merge(other) { return null; }
    /**
    Deserialize a step from its JSON representation. Will call
    through to the step class' own implementation of this method.
    */
    static fromJSON(schema, json) {
        if (!json || !json.stepType)
            throw new RangeError("Invalid input for Step.fromJSON");
        let type = stepsByID[json.stepType];
        if (!type)
            throw new RangeError(`No step type ${json.stepType} defined`);
        return type.fromJSON(schema, json);
    }
    /**
    To be able to serialize steps to JSON, each step needs a string
    ID to attach to its JSON representation. Use this method to
    register an ID for your step classes. Try to pick something
    that's unlikely to clash with steps from other modules.
    */
    static jsonID(id, stepClass) {
        if (id in stepsByID)
            throw new RangeError("Duplicate use of step JSON ID " + id);
        stepsByID[id] = stepClass;
        stepClass.prototype.jsonID = id;
        return stepClass;
    }
}
/**
The result of [applying](https://prosemirror.net/docs/ref/#transform.Step.apply) a step. Contains either a
new document or a failure value.
*/
class StepResult {
    /**
    @internal
    */
    constructor(
    /**
    The transformed document, if successful.
    */
    doc, 
    /**
    The failure message, if unsuccessful.
    */
    failed) {
        this.doc = doc;
        this.failed = failed;
    }
    /**
    Create a successful step result.
    */
    static ok(doc) { return new StepResult(doc, null); }
    /**
    Create a failed step result.
    */
    static fail(message) { return new StepResult(null, message); }
    /**
    Call [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) with the given
    arguments. Create a successful result if it succeeds, and a
    failed one if it throws a `ReplaceError`.
    */
    static fromReplace(doc, from, to, slice) {
        try {
            return StepResult.ok(doc.replace(from, to, slice));
        }
        catch (e) {
            if (e instanceof ReplaceError)
                return StepResult.fail(e.message);
            throw e;
        }
    }
}

function mapFragment(fragment, f, parent) {
    let mapped = [];
    for (let i = 0; i < fragment.childCount; i++) {
        let child = fragment.child(i);
        if (child.content.size)
            child = child.copy(mapFragment(child.content, f, child));
        if (child.isInline)
            child = f(child, parent, i);
        mapped.push(child);
    }
    return Fragment.fromArray(mapped);
}
/**
Add a mark to all inline content between two positions.
*/
class AddMarkStep extends Step {
    /**
    Create a mark step.
    */
    constructor(
    /**
    The start of the marked range.
    */
    from, 
    /**
    The end of the marked range.
    */
    to, 
    /**
    The mark to add.
    */
    mark) {
        super();
        this.from = from;
        this.to = to;
        this.mark = mark;
    }
    apply(doc) {
        let oldSlice = doc.slice(this.from, this.to), $from = doc.resolve(this.from);
        let parent = $from.node($from.sharedDepth(this.to));
        let slice = new Slice(mapFragment(oldSlice.content, (node, parent) => {
            if (!node.isAtom || !parent.type.allowsMarkType(this.mark.type))
                return node;
            return node.mark(this.mark.addToSet(node.marks));
        }, parent), oldSlice.openStart, oldSlice.openEnd);
        return StepResult.fromReplace(doc, this.from, this.to, slice);
    }
    invert() {
        return new RemoveMarkStep(this.from, this.to, this.mark);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deleted && to.deleted || from.pos >= to.pos)
            return null;
        return new AddMarkStep(from.pos, to.pos, this.mark);
    }
    merge(other) {
        if (other instanceof AddMarkStep &&
            other.mark.eq(this.mark) &&
            this.from <= other.to && this.to >= other.from)
            return new AddMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
        return null;
    }
    toJSON() {
        return { stepType: "addMark", mark: this.mark.toJSON(),
            from: this.from, to: this.to };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for AddMarkStep.fromJSON");
        return new AddMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("addMark", AddMarkStep);
/**
Remove a mark from all inline content between two positions.
*/
class RemoveMarkStep extends Step {
    /**
    Create a mark-removing step.
    */
    constructor(
    /**
    The start of the unmarked range.
    */
    from, 
    /**
    The end of the unmarked range.
    */
    to, 
    /**
    The mark to remove.
    */
    mark) {
        super();
        this.from = from;
        this.to = to;
        this.mark = mark;
    }
    apply(doc) {
        let oldSlice = doc.slice(this.from, this.to);
        let slice = new Slice(mapFragment(oldSlice.content, node => {
            return node.mark(this.mark.removeFromSet(node.marks));
        }, doc), oldSlice.openStart, oldSlice.openEnd);
        return StepResult.fromReplace(doc, this.from, this.to, slice);
    }
    invert() {
        return new AddMarkStep(this.from, this.to, this.mark);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deleted && to.deleted || from.pos >= to.pos)
            return null;
        return new RemoveMarkStep(from.pos, to.pos, this.mark);
    }
    merge(other) {
        if (other instanceof RemoveMarkStep &&
            other.mark.eq(this.mark) &&
            this.from <= other.to && this.to >= other.from)
            return new RemoveMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
        return null;
    }
    toJSON() {
        return { stepType: "removeMark", mark: this.mark.toJSON(),
            from: this.from, to: this.to };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
        return new RemoveMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("removeMark", RemoveMarkStep);
/**
Add a mark to a specific node.
*/
class AddNodeMarkStep extends Step {
    /**
    Create a node mark step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The mark to add.
    */
    mark) {
        super();
        this.pos = pos;
        this.mark = mark;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at mark step's position");
        let updated = node.type.create(node.attrs, null, this.mark.addToSet(node.marks));
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    invert(doc) {
        let node = doc.nodeAt(this.pos);
        if (node) {
            let newSet = this.mark.addToSet(node.marks);
            if (newSet.length == node.marks.length) {
                for (let i = 0; i < node.marks.length; i++)
                    if (!node.marks[i].isInSet(newSet))
                        return new AddNodeMarkStep(this.pos, node.marks[i]);
                return new AddNodeMarkStep(this.pos, this.mark);
            }
        }
        return new RemoveNodeMarkStep(this.pos, this.mark);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new AddNodeMarkStep(pos.pos, this.mark);
    }
    toJSON() {
        return { stepType: "addNodeMark", pos: this.pos, mark: this.mark.toJSON() };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.pos != "number")
            throw new RangeError("Invalid input for AddNodeMarkStep.fromJSON");
        return new AddNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("addNodeMark", AddNodeMarkStep);
/**
Remove a mark from a specific node.
*/
class RemoveNodeMarkStep extends Step {
    /**
    Create a mark-removing step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The mark to remove.
    */
    mark) {
        super();
        this.pos = pos;
        this.mark = mark;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at mark step's position");
        let updated = node.type.create(node.attrs, null, this.mark.removeFromSet(node.marks));
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    invert(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node || !this.mark.isInSet(node.marks))
            return this;
        return new AddNodeMarkStep(this.pos, this.mark);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new RemoveNodeMarkStep(pos.pos, this.mark);
    }
    toJSON() {
        return { stepType: "removeNodeMark", pos: this.pos, mark: this.mark.toJSON() };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.pos != "number")
            throw new RangeError("Invalid input for RemoveNodeMarkStep.fromJSON");
        return new RemoveNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("removeNodeMark", RemoveNodeMarkStep);

/**
Replace a part of the document with a slice of new content.
*/
class ReplaceStep extends Step {
    /**
    The given `slice` should fit the 'gap' between `from` and
    `to`—the depths must line up, and the surrounding nodes must be
    able to be joined with the open sides of the slice. When
    `structure` is true, the step will fail if the content between
    from and to is not just a sequence of closing and then opening
    tokens (this is to guard against rebased replace steps
    overwriting something they weren't supposed to).
    */
    constructor(
    /**
    The start position of the replaced range.
    */
    from, 
    /**
    The end position of the replaced range.
    */
    to, 
    /**
    The slice to insert.
    */
    slice, 
    /**
    @internal
    */
    structure = false) {
        super();
        this.from = from;
        this.to = to;
        this.slice = slice;
        this.structure = structure;
    }
    apply(doc) {
        if (this.structure && contentBetween(doc, this.from, this.to))
            return StepResult.fail("Structure replace would overwrite content");
        return StepResult.fromReplace(doc, this.from, this.to, this.slice);
    }
    getMap() {
        return new StepMap([this.from, this.to - this.from, this.slice.size]);
    }
    invert(doc) {
        return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to));
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deletedAcross && to.deletedAcross)
            return null;
        return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice, this.structure);
    }
    merge(other) {
        if (!(other instanceof ReplaceStep) || other.structure || this.structure)
            return null;
        if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
            let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd);
            return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure);
        }
        else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
            let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd);
            return new ReplaceStep(other.from, this.to, slice, this.structure);
        }
        else {
            return null;
        }
    }
    toJSON() {
        let json = { stepType: "replace", from: this.from, to: this.to };
        if (this.slice.size)
            json.slice = this.slice.toJSON();
        if (this.structure)
            json.structure = true;
        return json;
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for ReplaceStep.fromJSON");
        return new ReplaceStep(json.from, json.to, Slice.fromJSON(schema, json.slice), !!json.structure);
    }
}
Step.jsonID("replace", ReplaceStep);
/**
Replace a part of the document with a slice of content, but
preserve a range of the replaced content by moving it into the
slice.
*/
class ReplaceAroundStep extends Step {
    /**
    Create a replace-around step with the given range and gap.
    `insert` should be the point in the slice into which the content
    of the gap should be moved. `structure` has the same meaning as
    it has in the [`ReplaceStep`](https://prosemirror.net/docs/ref/#transform.ReplaceStep) class.
    */
    constructor(
    /**
    The start position of the replaced range.
    */
    from, 
    /**
    The end position of the replaced range.
    */
    to, 
    /**
    The start of preserved range.
    */
    gapFrom, 
    /**
    The end of preserved range.
    */
    gapTo, 
    /**
    The slice to insert.
    */
    slice, 
    /**
    The position in the slice where the preserved range should be
    inserted.
    */
    insert, 
    /**
    @internal
    */
    structure = false) {
        super();
        this.from = from;
        this.to = to;
        this.gapFrom = gapFrom;
        this.gapTo = gapTo;
        this.slice = slice;
        this.insert = insert;
        this.structure = structure;
    }
    apply(doc) {
        if (this.structure && (contentBetween(doc, this.from, this.gapFrom) ||
            contentBetween(doc, this.gapTo, this.to)))
            return StepResult.fail("Structure gap-replace would overwrite content");
        let gap = doc.slice(this.gapFrom, this.gapTo);
        if (gap.openStart || gap.openEnd)
            return StepResult.fail("Gap is not a flat range");
        let inserted = this.slice.insertAt(this.insert, gap.content);
        if (!inserted)
            return StepResult.fail("Content does not fit in gap");
        return StepResult.fromReplace(doc, this.from, this.to, inserted);
    }
    getMap() {
        return new StepMap([this.from, this.gapFrom - this.from, this.insert,
            this.gapTo, this.to - this.gapTo, this.slice.size - this.insert]);
    }
    invert(doc) {
        let gap = this.gapTo - this.gapFrom;
        return new ReplaceAroundStep(this.from, this.from + this.slice.size + gap, this.from + this.insert, this.from + this.insert + gap, doc.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from), this.gapFrom - this.from, this.structure);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        let gapFrom = this.from == this.gapFrom ? from.pos : mapping.map(this.gapFrom, -1);
        let gapTo = this.to == this.gapTo ? to.pos : mapping.map(this.gapTo, 1);
        if ((from.deletedAcross && to.deletedAcross) || gapFrom < from.pos || gapTo > to.pos)
            return null;
        return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert, this.structure);
    }
    toJSON() {
        let json = { stepType: "replaceAround", from: this.from, to: this.to,
            gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert };
        if (this.slice.size)
            json.slice = this.slice.toJSON();
        if (this.structure)
            json.structure = true;
        return json;
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number" ||
            typeof json.gapFrom != "number" || typeof json.gapTo != "number" || typeof json.insert != "number")
            throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON");
        return new ReplaceAroundStep(json.from, json.to, json.gapFrom, json.gapTo, Slice.fromJSON(schema, json.slice), json.insert, !!json.structure);
    }
}
Step.jsonID("replaceAround", ReplaceAroundStep);
function contentBetween(doc, from, to) {
    let $from = doc.resolve(from), dist = to - from, depth = $from.depth;
    while (dist > 0 && depth > 0 && $from.indexAfter(depth) == $from.node(depth).childCount) {
        depth--;
        dist--;
    }
    if (dist > 0) {
        let next = $from.node(depth).maybeChild($from.indexAfter(depth));
        while (dist > 0) {
            if (!next || next.isLeaf)
                return true;
            next = next.firstChild;
            dist--;
        }
    }
    return false;
}

/**
Update an attribute in a specific node.
*/
class AttrStep extends Step {
    /**
    Construct an attribute step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The attribute to set.
    */
    attr, 
    // The attribute's new value.
    value) {
        super();
        this.pos = pos;
        this.attr = attr;
        this.value = value;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at attribute step's position");
        let attrs = Object.create(null);
        for (let name in node.attrs)
            attrs[name] = node.attrs[name];
        attrs[this.attr] = this.value;
        let updated = node.type.create(attrs, null, node.marks);
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    getMap() {
        return StepMap.empty;
    }
    invert(doc) {
        return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos).attrs[this.attr]);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new AttrStep(pos.pos, this.attr, this.value);
    }
    toJSON() {
        return { stepType: "attr", pos: this.pos, attr: this.attr, value: this.value };
    }
    static fromJSON(schema, json) {
        if (typeof json.pos != "number" || typeof json.attr != "string")
            throw new RangeError("Invalid input for AttrStep.fromJSON");
        return new AttrStep(json.pos, json.attr, json.value);
    }
}
Step.jsonID("attr", AttrStep);
/**
Update an attribute in the doc node.
*/
class DocAttrStep extends Step {
    /**
    Construct an attribute step.
    */
    constructor(
    /**
    The attribute to set.
    */
    attr, 
    // The attribute's new value.
    value) {
        super();
        this.attr = attr;
        this.value = value;
    }
    apply(doc) {
        let attrs = Object.create(null);
        for (let name in doc.attrs)
            attrs[name] = doc.attrs[name];
        attrs[this.attr] = this.value;
        let updated = doc.type.create(attrs, doc.content, doc.marks);
        return StepResult.ok(updated);
    }
    getMap() {
        return StepMap.empty;
    }
    invert(doc) {
        return new DocAttrStep(this.attr, doc.attrs[this.attr]);
    }
    map(mapping) {
        return this;
    }
    toJSON() {
        return { stepType: "docAttr", attr: this.attr, value: this.value };
    }
    static fromJSON(schema, json) {
        if (typeof json.attr != "string")
            throw new RangeError("Invalid input for DocAttrStep.fromJSON");
        return new DocAttrStep(json.attr, json.value);
    }
}
Step.jsonID("docAttr", DocAttrStep);

/**
@internal
*/
let TransformError = class extends Error {
};
TransformError = function TransformError(message) {
    let err = Error.call(this, message);
    err.__proto__ = TransformError.prototype;
    return err;
};
TransformError.prototype = Object.create(Error.prototype);
TransformError.prototype.constructor = TransformError;
TransformError.prototype.name = "TransformError";

const classesById = Object.create(null);
/**
Superclass for editor selections. Every selection type should
extend this. Should not be instantiated directly.
*/
class Selection {
    /**
    Initialize a selection with the head and anchor and ranges. If no
    ranges are given, constructs a single range across `$anchor` and
    `$head`.
    */
    constructor(
    /**
    The resolved anchor of the selection (the side that stays in
    place when the selection is modified).
    */
    $anchor, 
    /**
    The resolved head of the selection (the side that moves when
    the selection is modified).
    */
    $head, ranges) {
        this.$anchor = $anchor;
        this.$head = $head;
        this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))];
    }
    /**
    The selection's anchor, as an unresolved position.
    */
    get anchor() { return this.$anchor.pos; }
    /**
    The selection's head.
    */
    get head() { return this.$head.pos; }
    /**
    The lower bound of the selection's main range.
    */
    get from() { return this.$from.pos; }
    /**
    The upper bound of the selection's main range.
    */
    get to() { return this.$to.pos; }
    /**
    The resolved lower  bound of the selection's main range.
    */
    get $from() {
        return this.ranges[0].$from;
    }
    /**
    The resolved upper bound of the selection's main range.
    */
    get $to() {
        return this.ranges[0].$to;
    }
    /**
    Indicates whether the selection contains any content.
    */
    get empty() {
        let ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++)
            if (ranges[i].$from.pos != ranges[i].$to.pos)
                return false;
        return true;
    }
    /**
    Get the content of this selection as a slice.
    */
    content() {
        return this.$from.doc.slice(this.from, this.to, true);
    }
    /**
    Replace the selection with a slice or, if no slice is given,
    delete the selection. Will append to the given transaction.
    */
    replace(tr, content = Slice.empty) {
        // Put the new selection at the position after the inserted
        // content. When that ended in an inline node, search backwards,
        // to get the position after that node. If not, search forward.
        let lastNode = content.content.lastChild, lastParent = null;
        for (let i = 0; i < content.openEnd; i++) {
            lastParent = lastNode;
            lastNode = lastNode.lastChild;
        }
        let mapFrom = tr.steps.length, ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++) {
            let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
            tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content);
            if (i == 0)
                selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1);
        }
    }
    /**
    Replace the selection with the given node, appending the changes
    to the given transaction.
    */
    replaceWith(tr, node) {
        let mapFrom = tr.steps.length, ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++) {
            let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
            let from = mapping.map($from.pos), to = mapping.map($to.pos);
            if (i) {
                tr.deleteRange(from, to);
            }
            else {
                tr.replaceRangeWith(from, to, node);
                selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1);
            }
        }
    }
    /**
    Find a valid cursor or leaf node selection starting at the given
    position and searching back if `dir` is negative, and forward if
    positive. When `textOnly` is true, only consider cursor
    selections. Will return null when no valid selection position is
    found.
    */
    static findFrom($pos, dir, textOnly = false) {
        let inner = $pos.parent.inlineContent ? new TextSelection($pos)
            : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly);
        if (inner)
            return inner;
        for (let depth = $pos.depth - 1; depth >= 0; depth--) {
            let found = dir < 0
                ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
                : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly);
            if (found)
                return found;
        }
        return null;
    }
    /**
    Find a valid cursor or leaf node selection near the given
    position. Searches forward first by default, but if `bias` is
    negative, it will search backwards first.
    */
    static near($pos, bias = 1) {
        return this.findFrom($pos, bias) || this.findFrom($pos, -bias) || new AllSelection($pos.node(0));
    }
    /**
    Find the cursor or leaf node selection closest to the start of
    the given document. Will return an
    [`AllSelection`](https://prosemirror.net/docs/ref/#state.AllSelection) if no valid position
    exists.
    */
    static atStart(doc) {
        return findSelectionIn(doc, doc, 0, 0, 1) || new AllSelection(doc);
    }
    /**
    Find the cursor or leaf node selection closest to the end of the
    given document.
    */
    static atEnd(doc) {
        return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1) || new AllSelection(doc);
    }
    /**
    Deserialize the JSON representation of a selection. Must be
    implemented for custom classes (as a static class method).
    */
    static fromJSON(doc, json) {
        if (!json || !json.type)
            throw new RangeError("Invalid input for Selection.fromJSON");
        let cls = classesById[json.type];
        if (!cls)
            throw new RangeError(`No selection type ${json.type} defined`);
        return cls.fromJSON(doc, json);
    }
    /**
    To be able to deserialize selections from JSON, custom selection
    classes must register themselves with an ID string, so that they
    can be disambiguated. Try to pick something that's unlikely to
    clash with classes from other modules.
    */
    static jsonID(id, selectionClass) {
        if (id in classesById)
            throw new RangeError("Duplicate use of selection JSON ID " + id);
        classesById[id] = selectionClass;
        selectionClass.prototype.jsonID = id;
        return selectionClass;
    }
    /**
    Get a [bookmark](https://prosemirror.net/docs/ref/#state.SelectionBookmark) for this selection,
    which is a value that can be mapped without having access to a
    current document, and later resolved to a real selection for a
    given document again. (This is used mostly by the history to
    track and restore old selections.) The default implementation of
    this method just converts the selection to a text selection and
    returns the bookmark for that.
    */
    getBookmark() {
        return TextSelection.between(this.$anchor, this.$head).getBookmark();
    }
}
Selection.prototype.visible = true;
/**
Represents a selected range in a document.
*/
class SelectionRange {
    /**
    Create a range.
    */
    constructor(
    /**
    The lower bound of the range.
    */
    $from, 
    /**
    The upper bound of the range.
    */
    $to) {
        this.$from = $from;
        this.$to = $to;
    }
}
let warnedAboutTextSelection = false;
function checkTextSelection($pos) {
    if (!warnedAboutTextSelection && !$pos.parent.inlineContent) {
        warnedAboutTextSelection = true;
        console["warn"]("TextSelection endpoint not pointing into a node with inline content (" + $pos.parent.type.name + ")");
    }
}
/**
A text selection represents a classical editor selection, with a
head (the moving side) and anchor (immobile side), both of which
point into textblock nodes. It can be empty (a regular cursor
position).
*/
class TextSelection extends Selection {
    /**
    Construct a text selection between the given points.
    */
    constructor($anchor, $head = $anchor) {
        checkTextSelection($anchor);
        checkTextSelection($head);
        super($anchor, $head);
    }
    /**
    Returns a resolved position if this is a cursor selection (an
    empty text selection), and null otherwise.
    */
    get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null; }
    map(doc, mapping) {
        let $head = doc.resolve(mapping.map(this.head));
        if (!$head.parent.inlineContent)
            return Selection.near($head);
        let $anchor = doc.resolve(mapping.map(this.anchor));
        return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head);
    }
    replace(tr, content = Slice.empty) {
        super.replace(tr, content);
        if (content == Slice.empty) {
            let marks = this.$from.marksAcross(this.$to);
            if (marks)
                tr.ensureMarks(marks);
        }
    }
    eq(other) {
        return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head;
    }
    getBookmark() {
        return new TextBookmark(this.anchor, this.head);
    }
    toJSON() {
        return { type: "text", anchor: this.anchor, head: this.head };
    }
    /**
    @internal
    */
    static fromJSON(doc, json) {
        if (typeof json.anchor != "number" || typeof json.head != "number")
            throw new RangeError("Invalid input for TextSelection.fromJSON");
        return new TextSelection(doc.resolve(json.anchor), doc.resolve(json.head));
    }
    /**
    Create a text selection from non-resolved positions.
    */
    static create(doc, anchor, head = anchor) {
        let $anchor = doc.resolve(anchor);
        return new this($anchor, head == anchor ? $anchor : doc.resolve(head));
    }
    /**
    Return a text selection that spans the given positions or, if
    they aren't text positions, find a text selection near them.
    `bias` determines whether the method searches forward (default)
    or backwards (negative number) first. Will fall back to calling
    [`Selection.near`](https://prosemirror.net/docs/ref/#state.Selection^near) when the document
    doesn't contain a valid text position.
    */
    static between($anchor, $head, bias) {
        let dPos = $anchor.pos - $head.pos;
        if (!bias || dPos)
            bias = dPos >= 0 ? 1 : -1;
        if (!$head.parent.inlineContent) {
            let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true);
            if (found)
                $head = found.$head;
            else
                return Selection.near($head, bias);
        }
        if (!$anchor.parent.inlineContent) {
            if (dPos == 0) {
                $anchor = $head;
            }
            else {
                $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true)).$anchor;
                if (($anchor.pos < $head.pos) != (dPos < 0))
                    $anchor = $head;
            }
        }
        return new TextSelection($anchor, $head);
    }
}
Selection.jsonID("text", TextSelection);
class TextBookmark {
    constructor(anchor, head) {
        this.anchor = anchor;
        this.head = head;
    }
    map(mapping) {
        return new TextBookmark(mapping.map(this.anchor), mapping.map(this.head));
    }
    resolve(doc) {
        return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head));
    }
}
/**
A node selection is a selection that points at a single node. All
nodes marked [selectable](https://prosemirror.net/docs/ref/#model.NodeSpec.selectable) can be the
target of a node selection. In such a selection, `from` and `to`
point directly before and after the selected node, `anchor` equals
`from`, and `head` equals `to`..
*/
class NodeSelection extends Selection {
    /**
    Create a node selection. Does not verify the validity of its
    argument.
    */
    constructor($pos) {
        let node = $pos.nodeAfter;
        let $end = $pos.node(0).resolve($pos.pos + node.nodeSize);
        super($pos, $end);
        this.node = node;
    }
    map(doc, mapping) {
        let { deleted, pos } = mapping.mapResult(this.anchor);
        let $pos = doc.resolve(pos);
        if (deleted)
            return Selection.near($pos);
        return new NodeSelection($pos);
    }
    content() {
        return new Slice(Fragment.from(this.node), 0, 0);
    }
    eq(other) {
        return other instanceof NodeSelection && other.anchor == this.anchor;
    }
    toJSON() {
        return { type: "node", anchor: this.anchor };
    }
    getBookmark() { return new NodeBookmark(this.anchor); }
    /**
    @internal
    */
    static fromJSON(doc, json) {
        if (typeof json.anchor != "number")
            throw new RangeError("Invalid input for NodeSelection.fromJSON");
        return new NodeSelection(doc.resolve(json.anchor));
    }
    /**
    Create a node selection from non-resolved positions.
    */
    static create(doc, from) {
        return new NodeSelection(doc.resolve(from));
    }
    /**
    Determines whether the given node may be selected as a node
    selection.
    */
    static isSelectable(node) {
        return !node.isText && node.type.spec.selectable !== false;
    }
}
NodeSelection.prototype.visible = false;
Selection.jsonID("node", NodeSelection);
class NodeBookmark {
    constructor(anchor) {
        this.anchor = anchor;
    }
    map(mapping) {
        let { deleted, pos } = mapping.mapResult(this.anchor);
        return deleted ? new TextBookmark(pos, pos) : new NodeBookmark(pos);
    }
    resolve(doc) {
        let $pos = doc.resolve(this.anchor), node = $pos.nodeAfter;
        if (node && NodeSelection.isSelectable(node))
            return new NodeSelection($pos);
        return Selection.near($pos);
    }
}
/**
A selection type that represents selecting the whole document
(which can not necessarily be expressed with a text selection, when
there are for example leaf block nodes at the start or end of the
document).
*/
class AllSelection extends Selection {
    /**
    Create an all-selection over the given document.
    */
    constructor(doc) {
        super(doc.resolve(0), doc.resolve(doc.content.size));
    }
    replace(tr, content = Slice.empty) {
        if (content == Slice.empty) {
            tr.delete(0, tr.doc.content.size);
            let sel = Selection.atStart(tr.doc);
            if (!sel.eq(tr.selection))
                tr.setSelection(sel);
        }
        else {
            super.replace(tr, content);
        }
    }
    toJSON() { return { type: "all" }; }
    /**
    @internal
    */
    static fromJSON(doc) { return new AllSelection(doc); }
    map(doc) { return new AllSelection(doc); }
    eq(other) { return other instanceof AllSelection; }
    getBookmark() { return AllBookmark; }
}
Selection.jsonID("all", AllSelection);
const AllBookmark = {
    map() { return this; },
    resolve(doc) { return new AllSelection(doc); }
};
// FIXME we'll need some awareness of text direction when scanning for selections
// Try to find a selection inside the given node. `pos` points at the
// position where the search starts. When `text` is true, only return
// text selections.
function findSelectionIn(doc, node, pos, index, dir, text = false) {
    if (node.inlineContent)
        return TextSelection.create(doc, pos);
    for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
        let child = node.child(i);
        if (!child.isAtom) {
            let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text);
            if (inner)
                return inner;
        }
        else if (!text && NodeSelection.isSelectable(child)) {
            return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0));
        }
        pos += child.nodeSize * dir;
    }
    return null;
}
function selectionToInsertionEnd(tr, startLen, bias) {
    let last = tr.steps.length - 1;
    if (last < startLen)
        return;
    let step = tr.steps[last];
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep))
        return;
    let map = tr.mapping.maps[last], end;
    map.forEach((_from, _to, _newFrom, newTo) => { if (end == null)
        end = newTo; });
    tr.setSelection(Selection.near(tr.doc.resolve(end), bias));
}

function bind(f, self) {
    return !self || !f ? f : f.bind(self);
}
class FieldDesc {
    constructor(name, desc, self) {
        this.name = name;
        this.init = bind(desc.init, self);
        this.apply = bind(desc.apply, self);
    }
}
[
    new FieldDesc("doc", {
        init(config) { return config.doc || config.schema.topNodeType.createAndFill(); },
        apply(tr) { return tr.doc; }
    }),
    new FieldDesc("selection", {
        init(config, instance) { return config.selection || Selection.atStart(instance.doc); },
        apply(tr) { return tr.selection; }
    }),
    new FieldDesc("storedMarks", {
        init(config) { return config.storedMarks || null; },
        apply(tr, _marks, _old, state) { return state.selection.$cursor ? tr.storedMarks : null; }
    }),
    new FieldDesc("scrollToSelection", {
        init() { return 0; },
        apply(tr, prev) { return tr.scrolledIntoView ? prev + 1 : prev; }
    })
];
const keys = Object.create(null);
function createKey(name) {
    if (name in keys)
        return name + "$" + ++keys[name];
    keys[name] = 0;
    return name + "$";
}
/**
A key is used to [tag](https://prosemirror.net/docs/ref/#state.PluginSpec.key) plugins in a way
that makes it possible to find them, given an editor state.
Assigning a key does mean only one plugin of that type can be
active in a state.
*/
class PluginKey {
    /**
    Create a plugin key.
    */
    constructor(name = "key") { this.key = createKey(name); }
    /**
    Get the active plugin with this key, if any, from an editor
    state.
    */
    get(state) { return state.config.pluginsByKey[this.key]; }
    /**
    Get the plugin's state from an editor state.
    */
    getState(state) { return state[this.key]; }
}

var base = {
  8: "Backspace",
  9: "Tab",
  10: "Enter",
  12: "NumLock",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  44: "PrintScreen",
  45: "Insert",
  46: "Delete",
  59: ";",
  61: "=",
  91: "Meta",
  92: "Meta",
  106: "*",
  107: "+",
  108: ",",
  109: "-",
  110: ".",
  111: "/",
  144: "NumLock",
  145: "ScrollLock",
  160: "Shift",
  161: "Shift",
  162: "Control",
  163: "Control",
  164: "Alt",
  165: "Alt",
  173: "-",
  186: ";",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: "/",
  192: "`",
  219: "[",
  220: "\\",
  221: "]",
  222: "'"
};

var shift = {
  48: ")",
  49: "!",
  50: "@",
  51: "#",
  52: "$",
  53: "%",
  54: "^",
  55: "&",
  56: "*",
  57: "(",
  59: ":",
  61: "+",
  173: "_",
  186: ":",
  187: "+",
  188: "<",
  189: "_",
  190: ">",
  191: "?",
  192: "~",
  219: "{",
  220: "|",
  221: "}",
  222: "\""
};

var mac$1 = typeof navigator != "undefined" && /Mac/.test(navigator.platform);
var ie = typeof navigator != "undefined" && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);

// Fill in the digit keys
for (var i = 0; i < 10; i++) base[48 + i] = base[96 + i] = String(i);

// The function keys
for (var i = 1; i <= 24; i++) base[i + 111] = "F" + i;

// And the alphabetic keys
for (var i = 65; i <= 90; i++) {
  base[i] = String.fromCharCode(i + 32);
  shift[i] = String.fromCharCode(i);
}

// For each code that doesn't have a shift-equivalent, copy the base name
for (var code in base) if (!shift.hasOwnProperty(code)) shift[code] = base[code];

function keyName(event) {
  // On macOS, keys held with Shift and Cmd don't reflect the effect of Shift in `.key`.
  // On IE, shift effect is never included in `.key`.
  var ignoreKey = mac$1 && event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey ||
      ie && event.shiftKey && event.key && event.key.length == 1 ||
      event.key == "Unidentified";
  var name = (!ignoreKey && event.key) ||
    (event.shiftKey ? shift : base)[event.keyCode] ||
    event.key || "Unidentified";
  // Edge sometimes produces wrong names (Issue #3)
  if (name == "Esc") name = "Escape";
  if (name == "Del") name = "Delete";
  // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8860571/
  if (name == "Left") name = "ArrowLeft";
  if (name == "Up") name = "ArrowUp";
  if (name == "Right") name = "ArrowRight";
  if (name == "Down") name = "ArrowDown";
  return name
}

const mac = typeof navigator != "undefined" && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
const windows = typeof navigator != "undefined" && /Win/.test(navigator.platform);
function normalizeKeyName(name) {
    let parts = name.split(/-(?!$)/), result = parts[parts.length - 1];
    if (result == "Space")
        result = " ";
    let alt, ctrl, shift, meta;
    for (let i = 0; i < parts.length - 1; i++) {
        let mod = parts[i];
        if (/^(cmd|meta|m)$/i.test(mod))
            meta = true;
        else if (/^a(lt)?$/i.test(mod))
            alt = true;
        else if (/^(c|ctrl|control)$/i.test(mod))
            ctrl = true;
        else if (/^s(hift)?$/i.test(mod))
            shift = true;
        else if (/^mod$/i.test(mod)) {
            if (mac)
                meta = true;
            else
                ctrl = true;
        }
        else
            throw new Error("Unrecognized modifier name: " + mod);
    }
    if (alt)
        result = "Alt-" + result;
    if (ctrl)
        result = "Ctrl-" + result;
    if (meta)
        result = "Meta-" + result;
    if (shift)
        result = "Shift-" + result;
    return result;
}
function normalize(map) {
    let copy = Object.create(null);
    for (let prop in map)
        copy[normalizeKeyName(prop)] = map[prop];
    return copy;
}
function modifiers(name, event, shift = true) {
    if (event.altKey)
        name = "Alt-" + name;
    if (event.ctrlKey)
        name = "Ctrl-" + name;
    if (event.metaKey)
        name = "Meta-" + name;
    if (shift && event.shiftKey)
        name = "Shift-" + name;
    return name;
}
/**
Given a set of bindings (using the same format as
[`keymap`](https://prosemirror.net/docs/ref/#keymap.keymap)), return a [keydown
handler](https://prosemirror.net/docs/ref/#view.EditorProps.handleKeyDown) that handles them.
*/
function keydownHandler(bindings) {
    let map = normalize(bindings);
    return function (view, event) {
        let name = keyName(event), baseName, direct = map[modifiers(name, event)];
        if (direct && direct(view.state, view.dispatch, view))
            return true;
        // A character key
        if (name.length == 1 && name != " ") {
            if (event.shiftKey) {
                // In case the name was already modified by shift, try looking
                // it up without its shift modifier
                let noShift = map[modifiers(name, event, false)];
                if (noShift && noShift(view.state, view.dispatch, view))
                    return true;
            }
            if ((event.altKey || event.metaKey || event.ctrlKey) &&
                // Ctrl-Alt may be used for AltGr on Windows
                !(windows && event.ctrlKey && event.altKey) &&
                (baseName = base[event.keyCode]) && baseName != name) {
                // Try falling back to the keyCode when there's a modifier
                // active or the character produced isn't ASCII, and our table
                // produces a different name from the the keyCode. See #668,
                // #1060, #1529.
                let fromCode = map[modifiers(baseName, event)];
                if (fromCode && fromCode(view.state, view.dispatch, view))
                    return true;
            }
        }
        return false;
    };
}

//#region src/tablemap.ts
let readFromCache;
let addToCache;
if (typeof WeakMap != "undefined") {
	let cache = /* @__PURE__ */ new WeakMap();
	readFromCache = (key) => cache.get(key);
	addToCache = (key, value) => {
		cache.set(key, value);
		return value;
	};
} else {
	const cache = [];
	const cacheSize = 10;
	let cachePos = 0;
	readFromCache = (key) => {
		for (let i = 0; i < cache.length; i += 2) if (cache[i] == key) return cache[i + 1];
	};
	addToCache = (key, value) => {
		if (cachePos == cacheSize) cachePos = 0;
		cache[cachePos++] = key;
		return cache[cachePos++] = value;
	};
}
/**
* A table map describes the structure of a given table. To avoid
* recomputing them all the time, they are cached per table node. To
* be able to do that, positions saved in the map are relative to the
* start of the table, rather than the start of the document.
*
* @public
*/
var TableMap = class {
	constructor(width, height, map, problems) {
		this.width = width;
		this.height = height;
		this.map = map;
		this.problems = problems;
	}
	findCell(pos) {
		for (let i = 0; i < this.map.length; i++) {
			const curPos = this.map[i];
			if (curPos != pos) continue;
			const left = i % this.width;
			const top = i / this.width | 0;
			let right = left + 1;
			let bottom = top + 1;
			for (let j = 1; right < this.width && this.map[i + j] == curPos; j++) right++;
			for (let j = 1; bottom < this.height && this.map[i + this.width * j] == curPos; j++) bottom++;
			return {
				left,
				top,
				right,
				bottom
			};
		}
		throw new RangeError(`No cell with offset ${pos} found`);
	}
	colCount(pos) {
		for (let i = 0; i < this.map.length; i++) if (this.map[i] == pos) return i % this.width;
		throw new RangeError(`No cell with offset ${pos} found`);
	}
	nextCell(pos, axis, dir) {
		const { left, right, top, bottom } = this.findCell(pos);
		if (axis == "horiz") {
			if (dir < 0 ? left == 0 : right == this.width) return null;
			return this.map[top * this.width + (dir < 0 ? left - 1 : right)];
		} else {
			if (dir < 0 ? top == 0 : bottom == this.height) return null;
			return this.map[left + this.width * (dir < 0 ? top - 1 : bottom)];
		}
	}
	rectBetween(a, b) {
		const { left: leftA, right: rightA, top: topA, bottom: bottomA } = this.findCell(a);
		const { left: leftB, right: rightB, top: topB, bottom: bottomB } = this.findCell(b);
		return {
			left: Math.min(leftA, leftB),
			top: Math.min(topA, topB),
			right: Math.max(rightA, rightB),
			bottom: Math.max(bottomA, bottomB)
		};
	}
	cellsInRect(rect) {
		const result = [];
		const seen = {};
		for (let row = rect.top; row < rect.bottom; row++) for (let col = rect.left; col < rect.right; col++) {
			const index = row * this.width + col;
			const pos = this.map[index];
			if (seen[pos]) continue;
			seen[pos] = true;
			if (col == rect.left && col && this.map[index - 1] == pos || row == rect.top && row && this.map[index - this.width] == pos) continue;
			result.push(pos);
		}
		return result;
	}
	positionAt(row, col, table) {
		for (let i = 0, rowStart = 0;; i++) {
			const rowEnd = rowStart + table.child(i).nodeSize;
			if (i == row) {
				let index = col + row * this.width;
				const rowEndIndex = (row + 1) * this.width;
				while (index < rowEndIndex && this.map[index] < rowStart) index++;
				return index == rowEndIndex ? rowEnd - 1 : this.map[index];
			}
			rowStart = rowEnd;
		}
	}
	static get(table) {
		return readFromCache(table) || addToCache(table, computeMap(table));
	}
};
function computeMap(table) {
	if (table.type.spec.tableRole != "table") throw new RangeError("Not a table node: " + table.type.name);
	const width = findWidth(table), height = table.childCount;
	const map = [];
	let mapPos = 0;
	let problems = null;
	const colWidths = [];
	for (let i = 0, e = width * height; i < e; i++) map[i] = 0;
	for (let row = 0, pos = 0; row < height; row++) {
		const rowNode = table.child(row);
		pos++;
		for (let i = 0;; i++) {
			while (mapPos < map.length && map[mapPos] != 0) mapPos++;
			if (i == rowNode.childCount) break;
			const cellNode = rowNode.child(i);
			const { colspan, rowspan, colwidth } = cellNode.attrs;
			for (let h = 0; h < rowspan; h++) {
				if (h + row >= height) {
					(problems || (problems = [])).push({
						type: "overlong_rowspan",
						pos,
						n: rowspan - h
					});
					break;
				}
				const start = mapPos + h * width;
				for (let w = 0; w < colspan; w++) {
					if (map[start + w] == 0) map[start + w] = pos;
					else (problems || (problems = [])).push({
						type: "collision",
						row,
						pos,
						n: colspan - w
					});
					const colW = colwidth && colwidth[w];
					if (colW) {
						const widthIndex = (start + w) % width * 2, prev = colWidths[widthIndex];
						if (prev == null || prev != colW && colWidths[widthIndex + 1] == 1) {
							colWidths[widthIndex] = colW;
							colWidths[widthIndex + 1] = 1;
						} else if (prev == colW) colWidths[widthIndex + 1]++;
					}
				}
			}
			mapPos += colspan;
			pos += cellNode.nodeSize;
		}
		const expectedPos = (row + 1) * width;
		let missing = 0;
		while (mapPos < expectedPos) if (map[mapPos++] == 0) missing++;
		if (missing) (problems || (problems = [])).push({
			type: "missing",
			row,
			n: missing
		});
		pos++;
	}
	if (width === 0 || height === 0) (problems || (problems = [])).push({ type: "zero_sized" });
	const tableMap = new TableMap(width, height, map, problems);
	let badWidths = false;
	for (let i = 0; !badWidths && i < colWidths.length; i += 2) if (colWidths[i] != null && colWidths[i + 1] < height) badWidths = true;
	if (badWidths) findBadColWidths(tableMap, colWidths, table);
	return tableMap;
}
function findWidth(table) {
	let width = -1;
	let hasRowSpan = false;
	for (let row = 0; row < table.childCount; row++) {
		const rowNode = table.child(row);
		let rowWidth = 0;
		if (hasRowSpan) for (let j = 0; j < row; j++) {
			const prevRow = table.child(j);
			for (let i = 0; i < prevRow.childCount; i++) {
				const cell = prevRow.child(i);
				if (j + cell.attrs.rowspan > row) rowWidth += cell.attrs.colspan;
			}
		}
		for (let i = 0; i < rowNode.childCount; i++) {
			const cell = rowNode.child(i);
			rowWidth += cell.attrs.colspan;
			if (cell.attrs.rowspan > 1) hasRowSpan = true;
		}
		if (width == -1) width = rowWidth;
		else if (width != rowWidth) width = Math.max(width, rowWidth);
	}
	return width;
}
function findBadColWidths(map, colWidths, table) {
	if (!map.problems) map.problems = [];
	const seen = {};
	for (let i = 0; i < map.map.length; i++) {
		const pos = map.map[i];
		if (seen[pos]) continue;
		seen[pos] = true;
		const node = table.nodeAt(pos);
		if (!node) throw new RangeError(`No cell with offset ${pos} found`);
		let updated = null;
		const attrs = node.attrs;
		for (let j = 0; j < attrs.colspan; j++) {
			const colWidth = colWidths[(i + j) % map.width * 2];
			if (colWidth != null && (!attrs.colwidth || attrs.colwidth[j] != colWidth)) (updated || (updated = freshColWidth(attrs)))[j] = colWidth;
		}
		if (updated) map.problems.unshift({
			type: "colwidth mismatch",
			pos,
			colwidth: updated
		});
	}
}
function freshColWidth(attrs) {
	if (attrs.colwidth) return attrs.colwidth.slice();
	const result = [];
	for (let i = 0; i < attrs.colspan; i++) result.push(0);
	return result;
}

//#endregion
//#region src/schema.ts
function getCellAttrs(dom, extraAttrs) {
	if (typeof dom === "string") return {};
	const widthAttr = dom.getAttribute("data-colwidth");
	const widths = widthAttr && /^\d+(,\d+)*$/.test(widthAttr) ? widthAttr.split(",").map((s) => Number(s)) : null;
	const colspan = Number(dom.getAttribute("colspan") || 1);
	const result = {
		colspan,
		rowspan: Number(dom.getAttribute("rowspan") || 1),
		colwidth: widths && widths.length == colspan ? widths : null
	};
	for (const prop in extraAttrs) {
		const getter = extraAttrs[prop].getFromDOM;
		const value = getter && getter(dom);
		if (value != null) result[prop] = value;
	}
	return result;
}
function setCellAttrs(node, extraAttrs) {
	const attrs = {};
	if (node.attrs.colspan != 1) attrs.colspan = node.attrs.colspan;
	if (node.attrs.rowspan != 1) attrs.rowspan = node.attrs.rowspan;
	if (node.attrs.colwidth) attrs["data-colwidth"] = node.attrs.colwidth.join(",");
	for (const prop in extraAttrs) {
		const setter = extraAttrs[prop].setDOMAttr;
		if (setter) setter(node.attrs[prop], attrs);
	}
	return attrs;
}
function validateColwidth(value) {
	if (value === null) return;
	if (!Array.isArray(value)) throw new TypeError("colwidth must be null or an array");
	for (const item of value) if (typeof item !== "number") throw new TypeError("colwidth must be null or an array of numbers");
}
/**
* This function creates a set of [node
* specs](http://prosemirror.net/docs/ref/#model.SchemaSpec.nodes) for
* `table`, `table_row`, and `table_cell` nodes types as used by this
* module. The result can then be added to the set of nodes when
* creating a schema.
*
* @public
*/
function tableNodes(options) {
	const extraAttrs = options.cellAttributes || {};
	const cellAttrs = {
		colspan: {
			default: 1,
			validate: "number"
		},
		rowspan: {
			default: 1,
			validate: "number"
		},
		colwidth: {
			default: null,
			validate: validateColwidth
		}
	};
	for (const prop in extraAttrs) cellAttrs[prop] = {
		default: extraAttrs[prop].default,
		validate: extraAttrs[prop].validate
	};
	return {
		table: {
			content: "table_row+",
			tableRole: "table",
			isolating: true,
			group: options.tableGroup,
			parseDOM: [{ tag: "table" }],
			toDOM() {
				return ["table", ["tbody", 0]];
			}
		},
		table_row: {
			content: "(table_cell | table_header)*",
			tableRole: "row",
			parseDOM: [{ tag: "tr" }],
			toDOM() {
				return ["tr", 0];
			}
		},
		table_cell: {
			content: options.cellContent,
			attrs: cellAttrs,
			tableRole: "cell",
			isolating: true,
			parseDOM: [{
				tag: "td",
				getAttrs: (dom) => getCellAttrs(dom, extraAttrs)
			}],
			toDOM(node) {
				return [
					"td",
					setCellAttrs(node, extraAttrs),
					0
				];
			}
		},
		table_header: {
			content: options.cellContent,
			attrs: cellAttrs,
			tableRole: "header_cell",
			isolating: true,
			parseDOM: [{
				tag: "th",
				getAttrs: (dom) => getCellAttrs(dom, extraAttrs)
			}],
			toDOM(node) {
				return [
					"th",
					setCellAttrs(node, extraAttrs),
					0
				];
			}
		}
	};
}
/**
* @public
*/
function tableNodeTypes(schema) {
	let result = schema.cached.tableNodeTypes;
	if (!result) {
		result = schema.cached.tableNodeTypes = {};
		for (const name in schema.nodes) {
			const type = schema.nodes[name], role = type.spec.tableRole;
			if (role) result[role] = type;
		}
	}
	return result;
}

//#endregion
//#region src/util.ts
/**
* @public
*/
new PluginKey("selectingCells");
/**
* @public
*/
function cellAround($pos) {
	for (let d = $pos.depth - 1; d > 0; d--) if ($pos.node(d).type.spec.tableRole == "row") return $pos.node(0).resolve($pos.before(d + 1));
	return null;
}
/**
* @public
*/
function isInTable(state) {
	const $head = state.selection.$head;
	for (let d = $head.depth; d > 0; d--) if ($head.node(d).type.spec.tableRole == "row") return true;
	return false;
}
/**
* @internal
*/
function selectionCell(state) {
	const sel = state.selection;
	if ("$anchorCell" in sel && sel.$anchorCell) return sel.$anchorCell.pos > sel.$headCell.pos ? sel.$anchorCell : sel.$headCell;
	else if ("node" in sel && sel.node && sel.node.type.spec.tableRole == "cell") return sel.$anchor;
	const $cell = cellAround(sel.$head) || cellNear(sel.$head);
	if ($cell) return $cell;
	throw new RangeError(`No cell found around position ${sel.head}`);
}
/**
* @public
*/
function cellNear($pos) {
	for (let after = $pos.nodeAfter, pos = $pos.pos; after; after = after.firstChild, pos++) {
		const role = after.type.spec.tableRole;
		if (role == "cell" || role == "header_cell") return $pos.doc.resolve(pos);
	}
	for (let before = $pos.nodeBefore, pos = $pos.pos; before; before = before.lastChild, pos--) {
		const role = before.type.spec.tableRole;
		if (role == "cell" || role == "header_cell") return $pos.doc.resolve(pos - before.nodeSize);
	}
}
/**
* @public
*/
function pointsAtCell($pos) {
	return $pos.parent.type.spec.tableRole == "row" && !!$pos.nodeAfter;
}
/**
* @internal
*/
function inSameTable($cellA, $cellB) {
	return $cellA.depth == $cellB.depth && $cellA.pos >= $cellB.start(-1) && $cellA.pos <= $cellB.end(-1);
}
/**
* @public
*/
function nextCell($pos, axis, dir) {
	const table = $pos.node(-1);
	const map = TableMap.get(table);
	const tableStart = $pos.start(-1);
	const moved = map.nextCell($pos.pos - tableStart, axis, dir);
	return moved == null ? null : $pos.node(0).resolve(tableStart + moved);
}
/**
* @public
*/
function removeColSpan(attrs, pos, n = 1) {
	const result = {
		...attrs,
		colspan: attrs.colspan - n
	};
	if (result.colwidth) {
		result.colwidth = result.colwidth.slice();
		result.colwidth.splice(pos, n);
		if (!result.colwidth.some((w) => w > 0)) result.colwidth = null;
	}
	return result;
}

//#endregion
//#region src/cellselection.ts
/**
* A [`Selection`](http://prosemirror.net/docs/ref/#state.Selection)
* subclass that represents a cell selection spanning part of a table.
* With the plugin enabled, these will be created when the user
* selects across cells, and will be drawn by giving selected cells a
* `selectedCell` CSS class.
*
* @public
*/
var CellSelection = class CellSelection extends Selection {
	constructor($anchorCell, $headCell = $anchorCell) {
		const table = $anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = $anchorCell.start(-1);
		const rect = map.rectBetween($anchorCell.pos - tableStart, $headCell.pos - tableStart);
		const doc = $anchorCell.node(0);
		const cells = map.cellsInRect(rect).filter((p) => p != $headCell.pos - tableStart);
		cells.unshift($headCell.pos - tableStart);
		const ranges = cells.map((pos) => {
			const cell = table.nodeAt(pos);
			if (!cell) throw new RangeError(`No cell with offset ${pos} found`);
			const from = tableStart + pos + 1;
			return new SelectionRange(doc.resolve(from), doc.resolve(from + cell.content.size));
		});
		super(ranges[0].$from, ranges[0].$to, ranges);
		this.$anchorCell = $anchorCell;
		this.$headCell = $headCell;
	}
	map(doc, mapping) {
		const $anchorCell = doc.resolve(mapping.map(this.$anchorCell.pos));
		const $headCell = doc.resolve(mapping.map(this.$headCell.pos));
		if (pointsAtCell($anchorCell) && pointsAtCell($headCell) && inSameTable($anchorCell, $headCell)) {
			const tableChanged = this.$anchorCell.node(-1) != $anchorCell.node(-1);
			if (tableChanged && this.isRowSelection()) return CellSelection.rowSelection($anchorCell, $headCell);
			else if (tableChanged && this.isColSelection()) return CellSelection.colSelection($anchorCell, $headCell);
			else return new CellSelection($anchorCell, $headCell);
		}
		return TextSelection.between($anchorCell, $headCell);
	}
	content() {
		const table = this.$anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = this.$anchorCell.start(-1);
		const rect = map.rectBetween(this.$anchorCell.pos - tableStart, this.$headCell.pos - tableStart);
		const seen = {};
		const rows = [];
		for (let row = rect.top; row < rect.bottom; row++) {
			const rowContent = [];
			for (let index = row * map.width + rect.left, col = rect.left; col < rect.right; col++, index++) {
				const pos = map.map[index];
				if (seen[pos]) continue;
				seen[pos] = true;
				const cellRect = map.findCell(pos);
				let cell = table.nodeAt(pos);
				if (!cell) throw new RangeError(`No cell with offset ${pos} found`);
				const extraLeft = rect.left - cellRect.left;
				const extraRight = cellRect.right - rect.right;
				if (extraLeft > 0 || extraRight > 0) {
					let attrs = cell.attrs;
					if (extraLeft > 0) attrs = removeColSpan(attrs, 0, extraLeft);
					if (extraRight > 0) attrs = removeColSpan(attrs, attrs.colspan - extraRight, extraRight);
					if (cellRect.left < rect.left) {
						cell = cell.type.createAndFill(attrs);
						if (!cell) throw new RangeError(`Could not create cell with attrs ${JSON.stringify(attrs)}`);
					} else cell = cell.type.create(attrs, cell.content);
				}
				if (cellRect.top < rect.top || cellRect.bottom > rect.bottom) {
					const attrs = {
						...cell.attrs,
						rowspan: Math.min(cellRect.bottom, rect.bottom) - Math.max(cellRect.top, rect.top)
					};
					if (cellRect.top < rect.top) cell = cell.type.createAndFill(attrs);
					else cell = cell.type.create(attrs, cell.content);
				}
				rowContent.push(cell);
			}
			rows.push(table.child(row).copy(Fragment.from(rowContent)));
		}
		const fragment = this.isColSelection() && this.isRowSelection() ? table : rows;
		return new Slice(Fragment.from(fragment), 1, 1);
	}
	replace(tr, content = Slice.empty) {
		const mapFrom = tr.steps.length, ranges = this.ranges;
		for (let i = 0; i < ranges.length; i++) {
			const { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
			tr.replace(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content);
		}
		const sel = Selection.findFrom(tr.doc.resolve(tr.mapping.slice(mapFrom).map(this.to)), -1);
		if (sel) tr.setSelection(sel);
	}
	replaceWith(tr, node) {
		this.replace(tr, new Slice(Fragment.from(node), 0, 0));
	}
	forEachCell(f) {
		const table = this.$anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = this.$anchorCell.start(-1);
		const cells = map.cellsInRect(map.rectBetween(this.$anchorCell.pos - tableStart, this.$headCell.pos - tableStart));
		for (let i = 0; i < cells.length; i++) f(table.nodeAt(cells[i]), tableStart + cells[i]);
	}
	isColSelection() {
		const anchorTop = this.$anchorCell.index(-1);
		const headTop = this.$headCell.index(-1);
		if (Math.min(anchorTop, headTop) > 0) return false;
		const anchorBottom = anchorTop + this.$anchorCell.nodeAfter.attrs.rowspan;
		const headBottom = headTop + this.$headCell.nodeAfter.attrs.rowspan;
		return Math.max(anchorBottom, headBottom) == this.$headCell.node(-1).childCount;
	}
	static colSelection($anchorCell, $headCell = $anchorCell) {
		const table = $anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = $anchorCell.start(-1);
		const anchorRect = map.findCell($anchorCell.pos - tableStart);
		const headRect = map.findCell($headCell.pos - tableStart);
		const doc = $anchorCell.node(0);
		if (anchorRect.top <= headRect.top) {
			if (anchorRect.top > 0) $anchorCell = doc.resolve(tableStart + map.map[anchorRect.left]);
			if (headRect.bottom < map.height) $headCell = doc.resolve(tableStart + map.map[map.width * (map.height - 1) + headRect.right - 1]);
		} else {
			if (headRect.top > 0) $headCell = doc.resolve(tableStart + map.map[headRect.left]);
			if (anchorRect.bottom < map.height) $anchorCell = doc.resolve(tableStart + map.map[map.width * (map.height - 1) + anchorRect.right - 1]);
		}
		return new CellSelection($anchorCell, $headCell);
	}
	isRowSelection() {
		const table = this.$anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = this.$anchorCell.start(-1);
		const anchorLeft = map.colCount(this.$anchorCell.pos - tableStart);
		const headLeft = map.colCount(this.$headCell.pos - tableStart);
		if (Math.min(anchorLeft, headLeft) > 0) return false;
		const anchorRight = anchorLeft + this.$anchorCell.nodeAfter.attrs.colspan;
		const headRight = headLeft + this.$headCell.nodeAfter.attrs.colspan;
		return Math.max(anchorRight, headRight) == map.width;
	}
	eq(other) {
		return other instanceof CellSelection && other.$anchorCell.pos == this.$anchorCell.pos && other.$headCell.pos == this.$headCell.pos;
	}
	static rowSelection($anchorCell, $headCell = $anchorCell) {
		const table = $anchorCell.node(-1);
		const map = TableMap.get(table);
		const tableStart = $anchorCell.start(-1);
		const anchorRect = map.findCell($anchorCell.pos - tableStart);
		const headRect = map.findCell($headCell.pos - tableStart);
		const doc = $anchorCell.node(0);
		if (anchorRect.left <= headRect.left) {
			if (anchorRect.left > 0) $anchorCell = doc.resolve(tableStart + map.map[anchorRect.top * map.width]);
			if (headRect.right < map.width) $headCell = doc.resolve(tableStart + map.map[map.width * (headRect.top + 1) - 1]);
		} else {
			if (headRect.left > 0) $headCell = doc.resolve(tableStart + map.map[headRect.top * map.width]);
			if (anchorRect.right < map.width) $anchorCell = doc.resolve(tableStart + map.map[map.width * (anchorRect.top + 1) - 1]);
		}
		return new CellSelection($anchorCell, $headCell);
	}
	toJSON() {
		return {
			type: "cell",
			anchor: this.$anchorCell.pos,
			head: this.$headCell.pos
		};
	}
	static fromJSON(doc, json) {
		return new CellSelection(doc.resolve(json.anchor), doc.resolve(json.head));
	}
	static create(doc, anchorCell, headCell = anchorCell) {
		return new CellSelection(doc.resolve(anchorCell), doc.resolve(headCell));
	}
	getBookmark() {
		return new CellBookmark(this.$anchorCell.pos, this.$headCell.pos);
	}
};
CellSelection.prototype.visible = false;
Selection.jsonID("cell", CellSelection);
/**
* @public
*/
var CellBookmark = class CellBookmark {
	constructor(anchor, head) {
		this.anchor = anchor;
		this.head = head;
	}
	map(mapping) {
		return new CellBookmark(mapping.map(this.anchor), mapping.map(this.head));
	}
	resolve(doc) {
		const $anchorCell = doc.resolve(this.anchor), $headCell = doc.resolve(this.head);
		if ($anchorCell.parent.type.spec.tableRole == "row" && $headCell.parent.type.spec.tableRole == "row" && $anchorCell.index() < $anchorCell.parent.childCount && $headCell.index() < $headCell.parent.childCount && inSameTable($anchorCell, $headCell)) return new CellSelection($anchorCell, $headCell);
		else return Selection.near($headCell, 1);
	}
};

//#endregion
//#region src/fixtables.ts
/**
* @public
*/
new PluginKey("fix-tables");

//#endregion
//#region src/commands.ts
/**
* Helper to get the selected rectangle in a table, if any. Adds table
* map, table node, and table start offset to the object for
* convenience.
*
* @public
*/
function selectedRect(state) {
	const sel = state.selection;
	const $pos = selectionCell(state);
	const table = $pos.node(-1);
	const tableStart = $pos.start(-1);
	const map = TableMap.get(table);
	return {
		...sel instanceof CellSelection ? map.rectBetween(sel.$anchorCell.pos - tableStart, sel.$headCell.pos - tableStart) : map.findCell($pos.pos - tableStart),
		tableStart,
		map,
		table
	};
}
function deprecated_toggleHeader(type) {
	return function(state, dispatch) {
		if (!isInTable(state)) return false;
		if (dispatch) {
			const types = tableNodeTypes(state.schema);
			const rect = selectedRect(state), tr = state.tr;
			const cells = rect.map.cellsInRect(type == "column" ? {
				left: rect.left,
				top: 0,
				right: rect.right,
				bottom: rect.map.height
			} : type == "row" ? {
				left: 0,
				top: rect.top,
				right: rect.map.width,
				bottom: rect.bottom
			} : rect);
			const nodes = cells.map((pos) => rect.table.nodeAt(pos));
			for (let i = 0; i < cells.length; i++) if (nodes[i].type == types.header_cell) tr.setNodeMarkup(rect.tableStart + cells[i], types.cell, nodes[i].attrs);
			if (tr.steps.length === 0) for (let i = 0; i < cells.length; i++) tr.setNodeMarkup(rect.tableStart + cells[i], types.header_cell, nodes[i].attrs);
			dispatch(tr);
		}
		return true;
	};
}
function isHeaderEnabledByType(type, rect, types) {
	const cellPositions = rect.map.cellsInRect({
		left: 0,
		top: 0,
		right: type == "row" ? rect.map.width : 1,
		bottom: type == "column" ? rect.map.height : 1
	});
	for (let i = 0; i < cellPositions.length; i++) {
		const cell = rect.table.nodeAt(cellPositions[i]);
		if (cell && cell.type !== types.header_cell) return false;
	}
	return true;
}
/**
* Toggles between row/column header and normal cells (Only applies to first row/column).
* For deprecated behavior pass `useDeprecatedLogic` in options with true.
*
* @public
*/
function toggleHeader(type, options) {
	options = options || { useDeprecatedLogic: false };
	if (options.useDeprecatedLogic) return deprecated_toggleHeader(type);
	return function(state, dispatch) {
		if (!isInTable(state)) return false;
		if (dispatch) {
			const types = tableNodeTypes(state.schema);
			const rect = selectedRect(state), tr = state.tr;
			const isHeaderRowEnabled = isHeaderEnabledByType("row", rect, types);
			const isHeaderColumnEnabled = isHeaderEnabledByType("column", rect, types);
			const selectionStartsAt = (type === "column" ? isHeaderRowEnabled : type === "row" ? isHeaderColumnEnabled : false) ? 1 : 0;
			const cellsRect = type == "column" ? {
				left: 0,
				top: selectionStartsAt,
				right: 1,
				bottom: rect.map.height
			} : type == "row" ? {
				left: selectionStartsAt,
				top: 0,
				right: rect.map.width,
				bottom: 1
			} : rect;
			const newType = type == "column" ? isHeaderColumnEnabled ? types.cell : types.header_cell : type == "row" ? isHeaderRowEnabled ? types.cell : types.header_cell : types.cell;
			rect.map.cellsInRect(cellsRect).forEach((relativeCellPos) => {
				const cellPos = relativeCellPos + rect.tableStart;
				const cell = tr.doc.nodeAt(cellPos);
				if (cell) tr.setNodeMarkup(cellPos, newType, cell.attrs);
			});
			dispatch(tr);
		}
		return true;
	};
}
/**
* Toggles whether the selected row contains header cells.
*
* @public
*/
toggleHeader("row", { useDeprecatedLogic: true });
/**
* Toggles whether the selected column contains header cells.
*
* @public
*/
toggleHeader("column", { useDeprecatedLogic: true });
/**
* Toggles whether the selected cells are header cells.
*
* @public
*/
toggleHeader("cell", { useDeprecatedLogic: true });
/**
* Deletes the content of the selected cells, if they are not empty.
*
* @public
*/
function deleteCellSelection(state, dispatch) {
	const sel = state.selection;
	if (!(sel instanceof CellSelection)) return false;
	if (dispatch) {
		const tr = state.tr;
		const baseContent = tableNodeTypes(state.schema).cell.createAndFill().content;
		sel.forEachCell((cell, pos) => {
			if (!cell.content.eq(baseContent)) tr.replace(tr.mapping.map(pos + 1), tr.mapping.map(pos + cell.nodeSize - 1), new Slice(baseContent, 0, 0));
		});
		if (tr.docChanged) dispatch(tr);
	}
	return true;
}

//#endregion
//#region src/input.ts
keydownHandler({
	ArrowLeft: arrow("horiz", -1),
	ArrowRight: arrow("horiz", 1),
	ArrowUp: arrow("vert", -1),
	ArrowDown: arrow("vert", 1),
	"Shift-ArrowLeft": shiftArrow("horiz", -1),
	"Shift-ArrowRight": shiftArrow("horiz", 1),
	"Shift-ArrowUp": shiftArrow("vert", -1),
	"Shift-ArrowDown": shiftArrow("vert", 1),
	Backspace: deleteCellSelection,
	"Mod-Backspace": deleteCellSelection,
	Delete: deleteCellSelection,
	"Mod-Delete": deleteCellSelection
});
function maybeSetSelection(state, dispatch, selection) {
	if (selection.eq(state.selection)) return false;
	if (dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
	return true;
}
/**
* @internal
*/
function arrow(axis, dir) {
	return (state, dispatch, view) => {
		if (!view) return false;
		const sel = state.selection;
		if (sel instanceof CellSelection) return maybeSetSelection(state, dispatch, Selection.near(sel.$headCell, dir));
		if (axis != "horiz" && !sel.empty) return false;
		const end = atEndOfCell(view, axis, dir);
		if (end == null) return false;
		if (axis == "horiz") return maybeSetSelection(state, dispatch, Selection.near(state.doc.resolve(sel.head + dir), dir));
		else {
			const $cell = state.doc.resolve(end);
			const $next = nextCell($cell, axis, dir);
			let newSel;
			if ($next) newSel = Selection.near($next, 1);
			else if (dir < 0) newSel = Selection.near(state.doc.resolve($cell.before(-1)), -1);
			else newSel = Selection.near(state.doc.resolve($cell.after(-1)), 1);
			return maybeSetSelection(state, dispatch, newSel);
		}
	};
}
function shiftArrow(axis, dir) {
	return (state, dispatch, view) => {
		if (!view) return false;
		const sel = state.selection;
		let cellSel;
		if (sel instanceof CellSelection) cellSel = sel;
		else {
			const end = atEndOfCell(view, axis, dir);
			if (end == null) return false;
			cellSel = new CellSelection(state.doc.resolve(end));
		}
		const $head = nextCell(cellSel.$headCell, axis, dir);
		if (!$head) return false;
		return maybeSetSelection(state, dispatch, new CellSelection(cellSel.$anchorCell, $head));
	};
}
function atEndOfCell(view, axis, dir) {
	if (!(view.state.selection instanceof TextSelection)) return null;
	const { $head } = view.state.selection;
	for (let d = $head.depth - 1; d >= 0; d--) {
		const parent = $head.node(d);
		if ((dir < 0 ? $head.index(d) : $head.indexAfter(d)) != (dir < 0 ? 0 : parent.childCount)) return null;
		if (parent.type.spec.tableRole == "cell" || parent.type.spec.tableRole == "header_cell") {
			const cellPos = $head.before(d);
			const dirStr = axis == "vert" ? dir > 0 ? "down" : "up" : dir > 0 ? "right" : "left";
			return view.endOfTextblock(dirStr) ? cellPos : null;
		}
	}
	return null;
}

//#endregion
//#region src/columnresizing.ts
/**
* @public
*/
new PluginKey("tableColumnResizing");

const olDOM = ["ol", 0], ulDOM = ["ul", 0], liDOM = ["li", 0];
/**
An ordered list [node spec](https://prosemirror.net/docs/ref/#model.NodeSpec). Has a single
attribute, `order`, which determines the number at which the list
starts counting, and defaults to 1. Represented as an `<ol>`
element.
*/
const orderedList = {
    attrs: { order: { default: 1, validate: "number" } },
    parseDOM: [{ tag: "ol", getAttrs(dom) {
                return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1 };
            } }],
    toDOM(node) {
        return node.attrs.order == 1 ? olDOM : ["ol", { start: node.attrs.order }, 0];
    }
};
/**
A bullet list node spec, represented in the DOM as `<ul>`.
*/
const bulletList = {
    parseDOM: [{ tag: "ul" }],
    toDOM() { return ulDOM; }
};
/**
A list item (`<li>`) spec.
*/
const listItem = {
    parseDOM: [{ tag: "li" }],
    toDOM() { return liDOM; },
    defining: true
};
function add(obj, props) {
    let copy = {};
    for (let prop in obj)
        copy[prop] = obj[prop];
    for (let prop in props)
        copy[prop] = props[prop];
    return copy;
}
/**
Convenience function for adding list-related node types to a map
specifying the nodes for a schema. Adds
[`orderedList`](https://prosemirror.net/docs/ref/#schema-list.orderedList) as `"ordered_list"`,
[`bulletList`](https://prosemirror.net/docs/ref/#schema-list.bulletList) as `"bullet_list"`, and
[`listItem`](https://prosemirror.net/docs/ref/#schema-list.listItem) as `"list_item"`.

`itemContent` determines the content expression for the list items.
If you want the commands defined in this module to apply to your
list structure, it should have a shape like `"paragraph block*"` or
`"paragraph (ordered_list | bullet_list)*"`. `listGroup` can be
given to assign a group name to the list node types, for example
`"block"`.
*/
function addListNodes(nodes, itemContent, listGroup) {
    return nodes.append({
        ordered_list: add(orderedList, { content: "list_item+", group: listGroup }),
        bullet_list: add(bulletList, { content: "list_item+", group: listGroup }),
        list_item: add(listItem, { content: itemContent })
    });
}

const pDOM = ["p", 0], 
      blockquoteDOM = ["blockquote", 0], 
      hrDOM = ["hr"],
      preDOM = ["pre", ["code", 0]], 
      brDOM = ["br"];

let baseNodes = OrderedMap.from({
  // :: NodeSpec The top level document node.
  doc: {
    content: "block+"
  },

  // :: NodeSpec A plain paragraph textblock. Represented in the DOM
  // as a `<p>` element.
  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{tag: "p"}],
    toDOM() { return pDOM }
  },

  // :: NodeSpec A blockquote (`<blockquote>`) wrapping one or more blocks.
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{tag: "blockquote"}],
    toDOM() { return blockquoteDOM }
  },

  // :: NodeSpec A horizontal rule (`<hr>`).
  horizontal_rule: {
    group: "block",
    parseDOM: [{tag: "hr"}],
    toDOM() { return hrDOM }
  },

  // :: NodeSpec A heading textblock, with a `level` attribute that
  // should hold the number 1 to 6. Parsed and serialized as `<h1>` to
  // `<h6>` elements. We include ID so that local links can reference them.
  heading: {
    attrs: {
      id: {default: null},
      level: {default: 1}
    },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      {tag: "h1", getAttrs(dom) { return {level: 1, id: dom.getAttribute("id")}}},
      {tag: "h2", getAttrs(dom) { return {level: 2, id: dom.getAttribute("id")}}},
      {tag: "h3", getAttrs(dom) { return {level: 3, id: dom.getAttribute("id")}}},
      {tag: "h4", getAttrs(dom) { return {level: 4, id: dom.getAttribute("id")}}},
      {tag: "h5", getAttrs(dom) { return {level: 5, id: dom.getAttribute("id")}}},
      {tag: "h6", getAttrs(dom) { return {level: 6, id: dom.getAttribute("id")}}}],
    toDOM(node) { 
      return ["h" + node.attrs.level, { id: node.attrs.id }, 0]
    }
  },

  // :: NodeSpec A code listing. Disallows marks or non-text inline
  // nodes by default. Represented as a `<pre>` element with a
  // `<code>` element inside of it.
  code_block: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    parseDOM: [{tag: "pre", preserveWhitespace: "full"}],
    toDOM() { return preDOM }
  },

  // :: NodeSpec The text node.
  text: {
    group: "inline"
  },

  // :: NodeSpec An inline image (`<img>`) node. Supports `src`,
  // `alt`, and `href` attributes. The latter two default to the empty
  // string.
  image: {
    inline: true,
    attrs: {
      src: {},
      alt: {default: null},
      width: {default: null},
      height: {default: null}
    },
    group: "inline",
    parseDOM: [{
      tag: "img[src]", 
      getAttrs(dom) {
        const width = dom.getAttribute("width") && parseInt(dom.getAttribute("width"));
        const height = dom.getAttribute("height") && parseInt(dom.getAttribute("height"));
        return {
          src: dom.getAttribute("src"),
          alt: dom.getAttribute("alt"),
          width: width,
          height: height
        }
      }
    }],
    toDOM(node) { 
      let {src, alt, width, height} = node.attrs; 
      let minAttrs = {};
      minAttrs.src = src;
      if (alt) minAttrs.alt = alt;
      if (width) minAttrs.width = width;
      if (height) minAttrs.height = height;
      return ["img", minAttrs] 
    }
  },

  // :: NodeSpec A hard line break, represented in the DOM as `<br>`.
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{tag: "br"}],
    toDOM() { return brDOM }
  },

  // A div-delineated area within the MarkupEditor which can be editable or not,
  // and typically has its own styling. It may contain a <p> title and/or another div. 
  // In the latter case, this is used to hold a group of buttons.
  //
  // Notes: 
  //
  // 1. Changes to div here may need to be reflected in DivView found in markup.js.
  //
  // 2. We use a style rule to require divs to include id, class, parentId. The div elements 
  // are used in the Swift MarkupEditor under these specific conditions, and requiring these 
  // attributes prevents issues when pasting (e.g., from GitHub READMEs) include divs.
  //
  // 3. It might be possible to exclude divs that don't conform to MarkupEditor expectations 
  // by using a rule. For now, deriving a Node from html always removes divs and buttons, so 
  // the only way for them to get into the MarkupEditor is via paste, addDiv, and addButton.
  // See https://discuss.prosemirror.net/t/how-to-filter-pasted-content-by-node-type/4866 and
  // https://prosemirror.net/docs/ref/#inputrules
  div: {
    content: "block*",
    group: "block",
    isolating: true,    // Prevent operations like lift from going outside of a div
    selectable: false,
    attrs: {
      id: {default: null},
      parentId: {default: 'editor'},
      cssClass: {default: null},
      editable: {default: true},
      htmlContents: {default: null},
      spellcheck: {default: false},
      autocorrect: {default: 'on'},
      autocapitalize: {default: 'off'},
      writingsuggestions: {default: false},
    },
    parseDOM: [{
      style: "div[id, class, parentId]",
      getAttrs(dom) {
        const id = dom.getAttribute("id");
        const parentId = dom.getAttribute("parentId");
        const cssClass = dom.getAttribute("class");
        const editable = dom.getAttribute("editable") == "true";
        const spellcheck = dom.getAttribute("spellcheck") == "true";
        const autocorrect = dom.getAttribute("autocorrect") == "on";
        const autocapitalize = dom.getAttribute("autocapitalize") == "on";
        const writingsuggestions = dom.getAttribute("writingsuggestions") == "true";
        return {
          id: id,
          parentId: parentId,
          cssClass: cssClass,
          editable: editable,
          spellcheck: spellcheck,
          autocorrect: autocorrect,
          autocapitalize: autocapitalize,
          writingsuggestions: writingsuggestions,
          htmlContents: dom.innerHTML ?? ""
        }
      }
    }],
    // Notes:
    // 1. We produce div HTML that includes the id and class. This is because for non-editable 
    // divs, we have to find elements by id based on the HTML because we prevent ProseMirror from 
    // handling selection and rendering, and we have to do it for ourselves in the DivView. Also
    // the attributes on div are not part of the HTML content they hold, which is what is of
    // interest in MarkupEditor usage.
    //
    // 2. For the MarkupEditor, we set the top-level attributes of the editor div at initialization, 
    // and the other divs embedded in it inherit the behavior set once at the top.
    toDOM(node) {
      let {id, cssClass} = node.attrs; 
      return ["div", { id: id, class: cssClass }, 0] 
    }
  },

  button: {
    content: "text*",
    group: "block",
    attrs: {
      id: {default: null},
      parentId: {default: null},
      cssClass: {default: null},
      label: {default: ""}
    },
    parseDOM: [{
      tag: "button",
      getAttrs(dom) {
        const id = dom.getAttribute("id");
        const parentId = dom.getAttribute("parentId");
        const cssClass = dom.getAttribute("class");
        return {
          id: id,
          parentId: parentId,
          cssClass: cssClass,
          label: dom.innerHTML ?? ""
        }
      }
    }],
    toDOM(node) {
      let {id, cssClass, label} = node.attrs;
      const button = document.createElement("button");
      if (id) button.setAttribute("id", id);
      if (cssClass) button.setAttribute("class", cssClass);
      button.setAttribute("type", "button");
      if (label) button.innerHTML = label;
      return button;
    }
  }

});

// Mix the nodes from prosemirror-schema-list into the baseNodes to create a schema with list support.
baseNodes = addListNodes(baseNodes, '(paragraph | heading)+ block*', 'block');

// Create table nodes that support bordering
const tNodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM(dom) {
        return dom.style.backgroundColor || null;
      },
      setDOMAttr(value, attrs) {
        if (value)
          attrs.style = (attrs.style || '') + `background-color: ${value};`;
      },
    },
  }
});
tNodes.table.attrs = {class: {default: null}};
// The class for table indicates the type of bordering so needs to be parsed and output as 
// part of the table.
tNodes.table.parseDOM = [{
  tag: 'table', 
  getAttrs(dom) {
    return {class: dom.getAttribute('class')}
  }
}];
tNodes.table.toDOM = (node) => { return ['table', node.attrs, 0] };

// Append the modified tableNodes and export the resulting nodes
// :: Object
// [Specs](#model.NodeSpec) for the nodes defined in this schema.
const nodes = baseNodes.append(tNodes);

const emDOM = ["em", 0], 
      strongDOM = ["strong", 0], 
      codeDOM = ["code", 0],
      strikeDOM = ["s", 0],
      uDOM = ["u", 0],
      subDOM = ["sub", 0],
      supDOM = ["sup", 0];

// :: Object [Specs](#model.MarkSpec) for the marks in the schema.
const marks = {
  // :: MarkSpec A link. Has `href` and `title` attributes. `title`
  // defaults to the empty string. Rendered and parsed as an `<a>`
  // element.
  link: {
    attrs: {
      href: {},
      title: {default: null}
    },
    inclusive: false,
    parseDOM: [{tag: "a[href]", getAttrs(dom) {
      return {href: dom.getAttribute("href"), title: dom.getAttribute("title")}
    }}],
    toDOM(node) { let {href, title} = node.attrs; return ["a", {href, title}, 0] }
  },

  // :: MarkSpec An emphasis mark. Rendered as an `<em>` element.
  // Has parse rules that also match `<i>` and `font-style: italic`.
  em: {
    parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
    toDOM() { return emDOM }
  },

  s: {
    parseDOM: [{tag: "s"}, {tag: "del"}, {style: "text-decoration=line-through"}],
    toDOM() { return strikeDOM }
  },

  u: {
    parseDOM: [{tag: "u"}, {style: "text-decoration=underline"}],
    toDOM() { return uDOM }
  },

  sub: {
    parseDOM: [{tag: "sub"}, {style: "vertical-align: sub"}],
    toDOM() { return subDOM }
  },

  sup: {
    parseDOM: [{tag: "sup"}, {style: "vertical-align: super"}],
    toDOM() { return supDOM }
  },

  // :: MarkSpec A strong mark. Rendered as `<strong>`, parse rules
  // also match `<b>` and `font-weight: bold`.
  strong: {
    parseDOM: [{tag: "strong"},
               // This works around a Google Docs misbehavior where
               // pasted content will be inexplicably wrapped in `<b>`
               // tags with a font-weight normal.
               {tag: "b", getAttrs: node => node.style.fontWeight != "normal" && null},
               {style: "font-weight", getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null}],
    toDOM() { return strongDOM }
  },

  // :: MarkSpec Code font mark. Represented as a `<code>` element.
  code: {
    parseDOM: [{tag: "code"}],
    toDOM() { return codeDOM }
  }
};

// :: Schema
// This schema roughly corresponds to the document schema used by
// [CommonMark](http://commonmark.org/), minus the list elements,
// which are defined in the [`prosemirror-schema-list`](#schema-list)
// module.
//
// To reuse elements from this schema, extend or read from its
// `spec.nodes` and `spec.marks` [properties](#model.Schema.spec).
const schema = new Schema({nodes, marks});

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var markdownItFrontMatter;
var hasRequiredMarkdownItFrontMatter;

function requireMarkdownItFrontMatter () {
	if (hasRequiredMarkdownItFrontMatter) return markdownItFrontMatter;
	hasRequiredMarkdownItFrontMatter = 1;

	markdownItFrontMatter = function front_matter_plugin(md, cb) {
	  var min_markers = 3,
	      marker_str  = '-',
	      marker_char = marker_str.charCodeAt(0),
	      marker_len  = marker_str.length;

	  function frontMatter(state, startLine, endLine, silent) {
	    var pos,
	        nextLine,
	        marker_count,
	        token,
	        old_parent,
	        old_line_max,
	        start_content,
	        auto_closed = false,
	        start = state.bMarks[startLine] + state.tShift[startLine],
	        max = state.eMarks[startLine];

	    // Check out the first character of the first line quickly,
	    // this should filter out non-front matter
	    if (startLine !== 0 || marker_char !== state.src.charCodeAt(0)) {
	      return false;
	    }

	    // Check out the rest of the marker string
	    // while pos <= 3
	    for (pos = start + 1; pos <= max; pos++) {
	      if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
	        start_content = pos + 1;
	        break;
	      }
	    }

	    marker_count = Math.floor((pos - start) / marker_len);

	    if (marker_count < min_markers) {
	      return false;
	    }
	    pos -= (pos - start) % marker_len;

	    // Since start is found, we can report success here in validation mode
	    if (silent) {
	      return true;
	    }

	    // Search for the end of the block
	    nextLine = startLine;

	    for (;;) {
	      nextLine++;
	      if (nextLine >= endLine) {
	        // unclosed block should be autoclosed by end of document.
	        // also block seems to be autoclosed by end of parent
	        break;
	      }

	      if (state.src.slice(start, max) === '...') {
	        break;
	      }

	      start = state.bMarks[nextLine] + state.tShift[nextLine];
	      max = state.eMarks[nextLine];

	      if (start < max && state.sCount[nextLine] < state.blkIndent) {
	        // non-empty line with negative indent should stop the list:
	        // - ```
	        //  test
	        break;
	      }

	      if (marker_char !== state.src.charCodeAt(start)) {
	        continue;
	      }

	      if (state.sCount[nextLine] - state.blkIndent >= 4) {
	        // closing fence should be indented less than 4 spaces
	        continue;
	      }

	      for (pos = start + 1; pos <= max; pos++) {
	        if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
	          break;
	        }
	      }

	      // closing code fence must be at least as long as the opening one
	      if (Math.floor((pos - start) / marker_len) < marker_count) {
	        continue;
	      }

	      // make sure tail has spaces only
	      pos -= (pos - start) % marker_len;
	      pos = state.skipSpaces(pos);

	      if (pos < max) {
	        continue;
	      }

	      // found!
	      auto_closed = true;
	      break;
	    }

	    old_parent = state.parentType;
	    old_line_max = state.lineMax;
	    state.parentType = 'container';

	    // this will prevent lazy continuations from ever going past our end marker
	    state.lineMax = nextLine;

	    token        = state.push('front_matter', null, 0);
	    token.hidden = true;
	    token.markup = state.src.slice(startLine, pos);
	    token.block  = true;
	    token.map    = [ startLine, nextLine + (auto_closed ? 1 : 0) ];
	    token.meta   = state.src.slice(start_content, start - 1);

	    state.parentType = old_parent;
	    state.lineMax = old_line_max;
	    state.line = nextLine + (auto_closed ? 1 : 0);

	    cb(token.meta);

	    return true;
	  }

	  md.block.ruler.before(
	    'table',
	    'front_matter',
	    frontMatter,
	    {
	      alt: [
	        'paragraph',
	        'reference',
	        'blockquote',
	        'list' 
	      ]
	    }
	  );
	};
	return markdownItFrontMatter;
}

var markdownItFrontMatterExports = requireMarkdownItFrontMatter();
var frontMatterPlugin = /*@__PURE__*/getDefaultExportFromCjs(markdownItFrontMatterExports);

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

const muEl = document.querySelector('markup-editor');
if (!muEl) throw new Error('markup-editor element not found; plugin loaded too early')
const MU = muEl.MU;

/**
 * Export the active editor content as Markdown.
 *
 * @param {string} _content - unused; content comes from the active view
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
function exportFn(_content) {
  const view = MU.activeView();
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const doc = view.state.doc;
  const warnings = makeWarnings();
  const serializer = makeSerializer(warnings);
  const markdown = serializer.serialize(doc);
  return JSON.stringify({ result: markdown, warnings: warnings.get() })
}

/**
 * Import Markdown content, converting it to HTML for the editor.
 * Strips YAML frontmatter (returning it in `metadata`) and converts leading
 * HTML blocks into a fenced code_block before the main parse.
 *
 * @param {string} content - Markdown string to import
 * @returns {string} JSON string { result: string|null, warnings: string[], metadata?: string }
 */
function importFn(content) {
  const warnings = makeWarnings();

  // Step 1: Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // Convert a line index to its character offset in `normalized`
  function lineOffset(i) {
    let off = 0;
    for (let n = 0; n < i && n < lines.length; n++) off += lines[n].length + 1;
    return off
  }

  // Step 2: Single detection parse using a disposable markdown-it instance.
  // html: true required so that leading HTML blocks are tokenized as html_block,
  // not silently folded into paragraph tokens.
  let yamlContent = null;
  const md = new MarkdownIt({ html: true });
  md.use(frontMatterPlugin, (yaml) => { yamlContent = yaml; });
  const tokens = md.parse(normalized, {});

  // Locate YAML frontmatter token (map holds [startLine, endLine] inclusive/exclusive)
  let yamlStartLine = -1, yamlEndLine = -1;
  const fmToken = tokens.find(t => t.type === 'front_matter');
  if (fmToken && fmToken.map) {
    yamlStartLine = fmToken.map[0];
    yamlEndLine   = fmToken.map[1];
  }

  // Collect contiguous leading html_block tokens (skipping front_matter)
  let htmlStartLine = -1, htmlEndLine = -1;
  for (const tok of tokens) {
    // Skip frontmatter and structural (hidden) tokens — they don't represent content boundaries
    if (tok.type === 'front_matter' || tok.hidden) continue
    if (tok.type === 'html_block' && tok.map) {
      if (htmlStartLine === -1) htmlStartLine = tok.map[0];
      htmlEndLine = tok.map[1];
    } else {
      break
    }
  }

  // Step 3: Apply edits from end toward front so earlier offsets stay valid
  let modified = normalized;

  if (htmlStartLine !== -1) {
    const htmlContent = lines.slice(htmlStartLine, htmlEndLine).join('\n');
    const replacement = '```html\n' + htmlContent + '\n```\n';
    modified = modified.slice(0, lineOffset(htmlStartLine)) + replacement + modified.slice(lineOffset(htmlEndLine));
  }

  if (yamlStartLine !== -1) {
    // YAML is always before HTML, so its char offset in `modified` is still valid
    modified = modified.slice(0, lineOffset(yamlStartLine)) + modified.slice(lineOffset(yamlEndLine));
  }

  // Step 4: Parse modified content with the main parser
  const parser = makeParser(schema, warnings);
  const doc = parser.parse(modified);
  const domSerializer = DOMSerializer.fromSchema(schema);
  const div = document.createElement('div');
  div.appendChild(domSerializer.serializeFragment(doc.content));

  const out = { result: div.innerHTML, warnings: warnings.get() };
  if (yamlContent !== null && yamlContent !== '') out.metadata = yamlContent;
  return JSON.stringify(out)
}

MU.registerPlugin({
  name: 'Markdown',
  extension: 'md',
  export: exportFn,
  import: importFn
});

export { exportFn, importFn };
