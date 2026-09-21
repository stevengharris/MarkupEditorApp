import { MU } from './markup-editor.js';

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0);
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    , // determined by compression function
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
        var c = i, k = 9;
        while (--k)
            c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();
// CRC32
var crc = function () {
    var c = -1;
    return {
        p: function (d) {
            // closures have awful performance
            var cr = c;
            for (var i = 0; i < d.length; ++i)
                cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
            c = cr;
        },
        d: function () { return ~c; }
    };
};
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
// Walmart object spread
var mrg = function (a, b) {
    var o = {};
    for (var k in a)
        o[k] = a[k];
    for (var k in b)
        o[k] = b[k];
    return o;
};
// write bytes
var wbytes = function (d, b, v) {
    for (; v; ++b)
        d[b] = v, v >>>= 8;
};
/**
 * Compresses data with DEFLATE without any wrapper
 * @param data The data to compress
 * @param opts The compression options
 * @returns The deflated version of the data
 */
function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
}
// flatten a directory structure
var fltn = function (d, p, t, o) {
    for (var k in d) {
        var val = d[k], n = p + k, op = o;
        if (Array.isArray(val))
            op = mrg(o, val[1]), val = val[0];
        if (ArrayBuffer.isView(val))
            t[n] = [val, op];
        else {
            t[n += '/'] = [new u8(0), op];
            fltn(val, n, t, o);
        }
    }
};
// text encoder
var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }
/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
function strToU8(str, latin1) {
    var i; 
    if (te)
        return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function (v) { ar[ai++] = v; };
    for (var i = 0; i < l; ++i) {
        if (ai + 5 > ar.length) {
            var n = new u8(ai + 8 + ((l - i) << 1));
            n.set(ar);
            ar = n;
        }
        var c = str.charCodeAt(i);
        if (c < 128 || latin1)
            w(c);
        else if (c < 2048)
            w(192 | (c >> 6)), w(128 | (c & 63));
        else if (c > 55295 && c < 57344)
            c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                w(240 | (c >> 18)), w(128 | ((c >> 12) & 63)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
        else
            w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
    }
    return slc(ar, 0, ai);
}
// extra field length
var exfl = function (ex) {
    var le = 0;
    if (ex) {
        for (var k in ex) {
            var l = ex[k].length;
            if (l > 65535)
                err(9);
            le += l + 4;
        }
    }
    return le;
};
// write zip header
var wzh = function (d, b, f, fn, u, c, ce, co) {
    var fl = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50), b += 4;
    if (ce != null)
        d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2; // spec compliance? what's that?
    d[b++] = (f.flag << 1) | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
        err(10);
    wbytes(d, b, (y << 25) | ((dt.getMonth() + 1) << 21) | (dt.getDate() << 16) | (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1)), b += 4;
    if (c != -1) {
        wbytes(d, b, f.crc);
        wbytes(d, b + 4, c < 0 ? -c - 2 : c);
        wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
        wbytes(d, b, col);
        wbytes(d, b + 6, f.attrs);
        wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl;
    if (exl) {
        for (var k in ex) {
            var exf = ex[k], l = exf.length;
            wbytes(d, b, +k);
            wbytes(d, b + 2, l);
            d.set(exf, b + 4), b += 4 + l;
        }
    }
    if (col)
        d.set(co, b), b += col;
    return b;
};
// write zip footer (end of central directory)
var wzf = function (o, b, c, d, e) {
    wbytes(o, b, 0x6054B50); // skip disk
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
};
/**
 * Synchronously creates a ZIP file. Prefer using `zip` for better performance
 * with more than one file.
 * @param data The directory structure for the ZIP archive
 * @param opts The main options, merged with per-file options
 * @returns The generated ZIP archive
 */
function zipSync(data, opts) {
    if (!opts)
        opts = {};
    var r = {};
    var files = [];
    fltn(data, '', r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
        var _a = r[fn], file = _a[0], p = _a[1];
        var compression = p.level == 0 ? 0 : 8;
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        if (s > 65535)
            err(11);
        var d = compression ? deflateSync(file, p) : file, l = d.length;
        var c = crc();
        c.p(file);
        files.push(mrg(p, {
            size: file.length,
            crc: c.d(),
            c: d,
            f: f,
            m: m,
            u: s != fn.length || (m && (com.length != ms)),
            o: o,
            compression: compression
        }));
        o += 30 + s + exl + l;
        tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
        var f = files[i];
        wzh(out, f.o, f, f.f, f.u, f.c.length);
        var badd = 30 + f.f.length + exfl(f.extra);
        out.set(f.c, f.o + badd);
        wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
}

// btoa/atob operate on binary strings, not bytes directly -- chunk the encode to stay well
// under any engine's call-stack argument-count limit (a single String.fromCharCode(...spread)
// over a real document-sized buffer overflows it).
const CHUNK_SIZE = 0x8000;

// Accepts a Uint8Array (including a Node Buffer) or an ArrayBuffer.
function bytesToBase64(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
    }
    return btoa(binary)
}

function base64ToBytes$1(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes
}

const IMG_SRC_PATTERN$1 = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

const PNG_SIGNATURE_LENGTH = 8;
const PNG_CHUNKS_TO_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

// Strips every PNG chunk except the ones that actually matter for decoding the pixels
// (IHDR/PLTE/tRNS/IDAT/IEND). WKWebView's canvas.toDataURL() embeds an eXIf chunk (PNG's 2017
// spec addition) even for a synthetic canvas with no real camera provenance -- decoding a real
// one showed it carries only the image's width/height and an sRGB colorspace flag, both
// already present in IHDR/sRGB. A consumer that doesn't recognize eXIf is supposed to skip it
// per the PNG spec's ancillary-chunk convention, but not every real-world parser does --
// dropping it outright costs nothing, since none of the stripped chunks carry information
// IHDR/IDAT don't already.
function stripPngAncillaryChunks(bytes) {
    const kept = [bytes.subarray(0, PNG_SIGNATURE_LENGTH)];
    let pos = PNG_SIGNATURE_LENGTH;
    while (pos < bytes.length) {
        const length = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0);
        const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
        const chunkEnd = pos + 12 + length; // length(4) + type(4) + data(length) + crc(4)
        if (PNG_CHUNKS_TO_KEEP.has(type)) kept.push(bytes.subarray(pos, chunkEnd));
        pos = chunkEnd;
    }
    const result = new Uint8Array(kept.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of kept) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result
}

// Re-encodes a `data:image/png;base64,...` URI with stripPngAncillaryChunks applied.
function stripPngMetadata(dataUri) {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const stripped = stripPngAncillaryChunks(base64ToBytes$1(base64));
    return `data:image/png;base64,${bytesToBase64(stripped)}`
}

// A format that embeds images needs real bytes, not a local path or remote URL -- this
// resolves every non-data: <img> to a data: URI before conversion.
//
// Not fetch()/XMLHttpRequest: fetch() of a local image resolves with an opaque {ok: false,
// status: 0} even for a file that displays correctly via a plain <img> tag -- WKWebView
// restricts fetch()/XHR access to file:// URLs separately from native <img> loading. A real
// Image element reuses the resource-loading path already proven for on-screen display, then
// extracts pixels via <canvas>.
//
// width, when given, is the DISPLAY size (the tag's HTML width attribute), not a resample
// target -- the canvas is always drawn at native pixel dimensions, so the embedded raster keeps
// full source resolution regardless of display size. Returns the display {width, height}
// alongside the data: URI; resolveImages rewrites the tag's width/height attributes to those
// values, since exporters size the image from them, not from the embedded pixel data.
//
// Height is not taken from the tag's height attribute, even when present -- markup.css's
// `img { height: auto }` means the live editor never uses that attribute for layout; only
// `width` is real sizing intent.
async function loadImageAsDataUri(src, width) {
    const image = new Image();
    // CORS mode is required for canvas.toDataURL() to read a cross-origin image's pixels even
    // when the server sends a permissive Access-Control-Allow-Origin header -- without this,
    // the browser fetches in default no-cors mode and the image stays canvas-tainted regardless
    // of server headers. Scoped to http(s) only: local file:// loading already works via the
    // plain <img> path above, and crossOrigin there is untested against WKWebView's separate
    // file:// restrictions.
    if (/^https?:\/\//i.test(src)) {
        image.crossOrigin = 'anonymous';
    }
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('failed to load'));
        image.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const hasDisplayWidth = width && image.naturalWidth;
    const displayWidth = hasDisplayWidth ? width : image.naturalWidth;
    const displayHeight = hasDisplayWidth
        ? Math.round(width * (image.naturalHeight / image.naturalWidth))
        : image.naturalHeight;
    // toDataURL() always rasterizes to PNG, not the original format -- accepted, since embedding
    // only needs a valid image. Throws a SecurityError for a tainted canvas (a
    // cross-origin image without CORS access), with no client-side way to recover the bytes;
    // this rejects like any other load failure and resolveImages falls back to a link.
    return { dataUri: stripPngMetadata(canvas.toDataURL()), width: displayWidth, height: displayHeight }
}

// The visible pixel width of an <img> tag -- only a bare integer counts; a percentage or
// "auto" returns null, same as no attribute (loadImageAsDataUri then uses natural size).
function imageWidth(tag) {
    const match = tag.match(/\bwidth\s*=\s*["'](\d+)["']/i);
    return match ? parseInt(match[1], 10) : null
}

// Link placeholder text for an image that couldn't embed: alt text plus url when alt is
// present, just the url otherwise. `alt`/`src` come from `MU.getHTML()`'s output, serialized
// via a real ProseMirror DOMSerializer/DOM innerHTML (markup.js's getHTML()) -- already
// correctly HTML-entity-escaped by construction, so the fallback `<a href="...">` below
// concatenates them raw. Escaping again would double-escape legitimate content.
function imageLinkLabel(tag, src) {
    const match = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    const alt = match && match[1].trim();
    return alt ? `${alt} (${src})` : src
}

// Replaces an existing attribute's value in an HTML tag, or appends it if absent -- keeps
// width/height in sync with the returned display size, since exporters size the image from
// these attributes, not the embedded image data.
function setTagAttr(tag, name, value) {
    const existing = new RegExp(`(\\s${name}\\s*=\\s*)["'][^"']*["']`, 'i');
    if (existing.test(tag)) return tag.replace(existing, `$1"${value}"`)
    return tag.replace(/\/?>\s*$/, ` ${name}="${value}"$&`)
}

// `loadImage` is injectable so tests can exercise the control-flow logic without a real DOM --
// the loading mechanism itself (Image/canvas) is verified manually.
async function resolveImages(html, warnings, loadImage = loadImageAsDataUri) {
    let result = '';
    let lastIndex = 0;
    for (const match of html.matchAll(IMG_SRC_PATTERN$1)) {
        const [tag, src] = match;
        if (src.startsWith('data:')) continue // already embedded, nothing to do
        result += html.slice(lastIndex, match.index);
        lastIndex = match.index + tag.length;
        try {
            const { dataUri, width, height } = await loadImage(src, imageWidth(tag));
            let resolvedTag = tag.replace(src, dataUri);
            resolvedTag = setTagAttr(resolvedTag, 'width', width);
            resolvedTag = setTagAttr(resolvedTag, 'height', height);
            result += resolvedTag;
        } catch (error) {
            warnings.push(`Could not embed image "${src}": ${error.message} -- inserted a link instead`);
            result += `<a href="${src}">${imageLinkLabel(tag, src)}</a>`;
        }
    }
    return result + html.slice(lastIndex)
}

// The plugin envelope shape ({result, warnings, metadata}) is a contract with the Swift side
// (MarkupWKWebView+Extension.swift's runExporter): any exporter plugin returns exactly this
// JSON string, regardless of which library produced the bytes. `result` is the exported file,
// base64-encoded, or null on failure; `metadata` is reserved and always null.
function envelope(result, warnings) {
    return JSON.stringify({ result, warnings, metadata: null })
}

// `bytes` is a Uint8Array or ArrayBuffer holding the exported file.
function successEnvelope(bytes, warnings) {
    return envelope(bytesToBase64(bytes), warnings)
}

// Appends "<format> conversion failed: <message>" to `warnings` and returns a null-result
// envelope. A thrown exception would otherwise reach the host as an opaque missing result.
function failureEnvelope(warnings, format, error) {
    warnings.push(`${format} conversion failed: ${error.message}`);
    return envelope(null, warnings)
}

// Runs AFTER resolveImages: every embeddable <img src> is by then already a data: URI (either
// one resolveImages produced from a local/remote source, or one the source document already
// carried directly -- resolveImages leaves an existing data: URI untouched). An unresolvable
// image never reaches here -- resolveImages already rewrote it to a plain <a> link placeholder.
//
// EPUB wants each image as a real zip entry referenced by a relative href (schema: OPF
// manifest + XHTML <img src>), not a data: URI left inline -- this is the one real divergence
// from DOCX, whose ImageRun embeds the data: URI's bytes directly with no separate file/href
// concept. This module is that difference: it decodes each data: URI back to raw bytes and
// hands out a stable images/imageN.ext href, one entry per <img> occurrence in the document (no
// content-addressed de-duplication -- simpler, and correct even if two different images happen
// to hash-collide, at the cost of one zip entry per occurrence rather than per distinct image).
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const DATA_URI_PATTERN = /^data:image\/([\w+.-]+);base64,(.+)$/s;

// Maps a data: URI's MIME subtype to both a manifest media-type and a file extension. EPUB3's
// core media types (OPF spec, Core Media Types table) are GIF/JPEG/PNG/SVG -- WebP is a common,
// widely-supported non-core extension many reading systems accept too. An unrecognized subtype
// still gets a best-effort passthrough (extension = subtype, media-type = "image/<subtype>")
// rather than being dropped, with a warning -- some reading systems may reject it, but silently
// discarding a real embedded image is worse.
const MIME_TO_EXT = {
    png: 'png',
    jpeg: 'jpg',
    gif: 'gif',
    'svg+xml': 'svg',
    webp: 'webp',
};
const CORE_MEDIA_SUBTYPES = new Set(['png', 'jpeg', 'gif', 'svg+xml']);

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes
}

// Entry point: rewrites every embedded data: URI <img> in `html` to a relative
// "images/imageN.ext" href and returns the decoded bytes for each as a zip-ready manifest
// entry list. `html` and its returned `html` are XHTML-agnostic plain strings -- htmlToXhtml.js
// runs on the result afterward, same ordering DOCX uses for resolveImages -> htmlToDocxChildren.
function extractImages(html, warnings = []) {
    const images = [];
    let result = '';
    let lastIndex = 0;
    let nextId = 1;

    for (const match of html.matchAll(IMG_SRC_PATTERN)) {
        const [tag, src] = match;
        result += html.slice(lastIndex, match.index);
        lastIndex = match.index + tag.length;

        const dataMatch = src.match(DATA_URI_PATTERN);
        if (!dataMatch) {
            // Not a data: URI at all -- resolveImages should have already turned every
            // embeddable <img> into one (or replaced it with a link placeholder on failure).
            // Left as-is rather than dropped; htmlToXhtml.js's <img> handler warns again
            // when it can't use an unresolved src either.
            warnings.push(`<img> with an unresolved src is not embeddable in an EPUB -- expected resolveImages to have already run (got "${src}")`);
            result += tag;
            continue
        }

        const [, subtype, base64] = dataMatch;
        if (!CORE_MEDIA_SUBTYPES.has(subtype)) {
            warnings.push(`<img> data: URI has non-core EPUB media type "image/${subtype}" -- embedded anyway, but some reading systems may reject it`);
        }
        const ext = MIME_TO_EXT[subtype] ?? subtype;
        const mediaType = `image/${subtype}`;
        const filename = `images/image${nextId}.${ext}`;
        nextId++;

        let bytes;
        try {
            bytes = base64ToBytes(base64);
        } catch (error) {
            warnings.push(`<img> data: URI could not be decoded (${error.message}) -- skipped`);
            continue
        }

        images.push({ filename, mediaType, bytes });
        result += tag.replace(src, filename);
    }

    return { html: result + html.slice(lastIndex), images }
}

// Shared by htmlToXhtml.js, opf.js, and nav.js -- every XML text/attribute value this plugin
// emits (content-document text, dc:title, nav labels, ...) goes through one of these two.
function escapeXmlText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Dispatch table covers every tag markupeditor-base's schema can produce (schema/index.js is
// the authority, verified empirically against exporter-docx's equivalent table in
// htmlToDocx.js) -- an unrecognized tag warns instead of dropping silently.
//
// Unlike HTML -> OOXML (exporter-docx), HTML -> XHTML is nearly a well-formedness pass rather
// than a structural translation: XHTML natively represents nested blockquotes, real <ul>/<ol>/
// <li> list semantics, <table>/<thead>/<tbody>/<tfoot> structure, heading `id` anchors, and
// `<ol start>` directly -- none of the numbering/style-identity workarounds htmlToDocx.js needs
// for OOXML's flatter model are needed here. That also means several DOCX limitations don't
// carry over: internal `<a href="#id">` links resolve for real (headings keep their `id`), and
// `<ol start>` is honored rather than warned about.

const VOID_TAGS = new Set(['br', 'img', 'hr']);

// Attributes preserved verbatim (after escaping) per tag, matching what markupeditor-base's
// schema is documented to actually emit (see htmlToDocx.js's per-tag comments for the same
// inventory, e.g. table's `class`, td/th's colspan/rowspan/style, ol's `start`).
const ATTRS_BY_TAG = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    ol: ['start'],
    table: ['class'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
    div: ['id', 'class'],
    code: ['class'], // the fenced code_block's language-X class -- kept as a CSS/highlighter hook, unlike DOCX which has nowhere to hang it
};

// Tags with no special handling below recurse generically: serialize the tag, copy its
// allowed attributes, recurse into children. block-vs-inline is not a meaningful distinction
// at the XHTML syntax level the way it is for OOXML's Paragraph/run split.
const GENERIC_TAGS = new Set([
    'p', 'blockquote', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'strong', 'em', 'u', 's', 'sub', 'sup', 'code',
    'a',
]);

function attrString(element, tag) {
    const names = ATTRS_BY_TAG[tag];
    if (!names) return ''
    let out = '';
    for (const name of names) {
        const value = element.getAttribute(name);
        if (value !== null) out += ` ${name}="${escapeXmlAttr(value)}"`;
    }
    return out
}

// A text node that is entirely whitespace AND contains a newline is pretty-printing/indentation
// artifact, not meaningful content (e.g. "<p>\n    <s>text</s>\n</p>" from a formatted HTML
// source) -- matches htmlToDocx.js's isInsignificantWhitespace exactly, including the
// justification.
function isInsignificantWhitespace(text) {
    return text.trim() === '' && text.includes('\n')
}

function convertChildren(element, context) {
    let out = '';
    for (const node of element.childNodes) {
        out += convertNode(node, context);
    }
    return out
}

// Schema: code_block content is "text*" with marks disabled, rendered <pre><code
// class="language-X">. Line breaks and all whitespace inside are significant and preserved
// verbatim -- unlike generic recursion, this never drops or re-escapes structurally, only
// entity-escapes for well-formedness.
function convertCodeBlock(element, context) {
    const code = element.querySelector('code') ?? element;
    const languageClass = code.getAttribute('class');
    const classAttr = languageClass ? ` class="${escapeXmlAttr(languageClass)}"` : '';
    return `<pre><code${classAttr}>${escapeXmlText(code.textContent)}</code></pre>`
}

// Dropped entirely: an interactive affordance with no static-document representation (same
// decision as htmlToDocx.js's convertButton).
function convertButton() {
    return ''
}

function convertBr() {
    return '<br/>'
}

function convertHr() {
    return '<hr/>'
}

// resolveImages + extractImages run as pre-passes before this converter: every
// embeddable <img> arrives here with `src` already rewritten to a relative "images/imageN.ext"
// zip href. An <img> whose src is still a raw data:/http(s):/file: URI means something upstream
// didn't run -- warn rather than ship an EPUB with an unreachable reference. alt is REQUIRED
// (defaults to "") for EPUB accessibility conformance even when the source document omitted it.
function convertImg(element, context) {
    const src = element.getAttribute('src');
    if (!src || !src.startsWith('images/')) {
        context.warnings.push(`<img> with an unresolved src is not embeddable here -- expected resolveImages/extractImages to have already run (got "${src}")`);
        return ''
    }
    const alt = element.getAttribute('alt') ?? '';
    let tag = `<img src="${escapeXmlAttr(src)}" alt="${escapeXmlAttr(alt)}"`;
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    if (width !== null) tag += ` width="${escapeXmlAttr(width)}"`;
    if (height !== null) tag += ` height="${escapeXmlAttr(height)}"`;
    return tag + '/>'
}

// Schema: the 7 non-code marks map 1:1 onto a real XHTML inline element (unlike OOXML, which
// needs flat run properties -- see htmlToDocx.js's MARK_PROPS) -- `code` renders as <code>,
// which XHTML also has natively.
const SPECIAL_HANDLERS = {
    pre: convertCodeBlock,
    button: convertButton,
    br: convertBr,
    hr: convertHr,
    img: convertImg,
};

function convertElement(element, context) {
    const tag = element.tagName.toLowerCase();
    const special = SPECIAL_HANDLERS[tag];
    if (special) return special(element, context)
    if (GENERIC_TAGS.has(tag)) {
        const attrs = attrString(element, tag);
        if (VOID_TAGS.has(tag)) return `<${tag}${attrs}/>`
        return `<${tag}${attrs}>${convertChildren(element, context)}</${tag}>`
    }
    context.warnings.push(`unhandled tag <${tag}>`);
    return ''
}

function convertNode(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (isInsignificantWhitespace(node.textContent)) return ''
        return escapeXmlText(node.textContent)
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    return convertElement(node, context)
}

// Entry point: parses `html` and returns the XHTML markup for the content document's <body>
// (the caller wraps it with the XHTML5 doctype/head). Independent of MU and the plugin
// envelope, so it's unit-testable in isolation, same contract as htmlToDocxChildren.
function htmlToXhtmlBody(html, warnings = []) {
    const context = { warnings };
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return convertChildren(parsed.body, context)
}

// Used for the EPUB's dc:title -- MU.getHTML() carries no separate document-title field
// (docxexporter.js has the same gap and doesn't set a title at all; EPUB3 requires one), so the
// first <h1>'s text is the best available signal. Falls back to a generic default when there
// is none.
function extractDocumentTitle(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const h1 = parsed.body.querySelector('h1');
    const text = h1?.textContent?.trim();
    return text || 'Untitled Document'
}

// Used to build the EPUB3 nav document's table of contents (nav.js). Only headings that carry
// a real `id` (heading-ids.js assigns one to every heading the real import pipeline produces)
// can be a link target -- an id-less heading still renders in the content document, it just
// has no nav entry, which is a nav-only limitation, not a lossy conversion worth a warning.
function extractHeadings(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const headings = [];
    for (const el of parsed.body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        const id = el.getAttribute('id');
        if (!id) continue
        headings.push({ level: Number(el.tagName[1]), id, text: el.textContent.trim() });
    }
    return headings
}

const METADATA_LANGUAGE = 'metadata';

// Matched trimmed and case-insensitively, as the metadata codeview does.
function isMetadataLanguage(language) {
    return (language ?? '').trim().toLowerCase() === METADATA_LANGUAGE
}

// Strips quotes and unescapes a scalar token, as YAMLMetadata.parseScalar (Swift) does.
function parseScalar(token) {
    if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1).replace(/\\(["\\])/g, '$1')
    }
    if (token.length >= 2 && token.startsWith("'") && token.endsWith("'")) {
        return token.slice(1, -1).replace(/''/g, "'")
    }
    return token
}

// Splits a flow sequence (`[a, "b, c", d]`) on commas outside quotes. A quote only opens at
// the start of an item, so an apostrophe inside a bare word ("don't") is literal.
function parseFlowSequence(text) {
    let inner = text.trim();
    if (inner.startsWith('[')) inner = inner.slice(1);
    if (inner.endsWith(']')) inner = inner.slice(0, -1);
    const items = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (quote) {
            current += ch;
            if (quote === '"' && ch === '\\' && i + 1 < inner.length) current += inner[++i];
            else if (ch === quote) quote = null;
        } else if ((ch === '"' || ch === "'") && current.trim() === '') {
            quote = ch;
            current += ch;
        } else if (ch === ',') {
            items.push(parseScalar(current.trim()));
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) items.push(parseScalar(current.trim()));
    return items
}

// Best-effort frontmatter parser for the constructs YAMLMetadata.parse (Swift) handles: scalar
// values (quotes stripped, escapes undone), flow sequences ("key: [a, b]") and block sequences
// ("key:" followed by "- item" lines). Returns ordered {key, value} entries with the key as
// typed; a scalar value is a string and a sequence a string array. Not a full YAML parser, and
// not a round-trip: it only reads values back out.
function parseFrontmatterEntries(text) {
    const entries = [];
    const lines = (text ?? '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#') || line === '---') continue
        if (line.endsWith(': |') || line.endsWith(': >')) continue
        const match = line.match(/^([^:\s][^:]*):\s?(.*)$/);
        if (!match) continue
        const key = match[1].trim();
        const rawValue = match[2].trim();
        if (rawValue === '') {
            const items = [];
            let j = i + 1;
            while (j < lines.length) {
                const next = lines[j].trim();
                if (next.startsWith('- ')) items.push(parseScalar(next.slice(2).trim()));
                else if (next !== '') break
                j++;
            }
            if (items.length) {
                entries.push({ key, value: items });
                i = j - 1;
            } else {
                entries.push({ key, value: '' });
            }
        } else if (rawValue.startsWith('[')) {
            entries.push({ key, value: parseFlowSequence(rawValue) });
        } else {
            entries.push({ key, value: parseScalar(rawValue) });
        }
    }
    return entries
}

// Field names are free-typed, so "Title:" and "title:" are equally likely. Lowercasing here
// lets callers look fields up by one fixed name; a repeated key keeps its last value.
function parseFrontmatter(text) {
    const values = {};
    for (const { key, value } of parseFrontmatterEntries(text)) values[key.toLowerCase()] = value;
    return values
}

// The document's YAML frontmatter is seeded into the live ProseMirror document as a code_block
// at position 0 (MarkupDocument.seedMetadataBlock, Swift-side) whenever metadata is non-empty.
// MU.activeView() is the only way to reach the document model. Returns {} when there's no
// metadata block or no active view.
function extractMetadata(MU) {
    const view = MU.activeView?.();
    const first = view?.state?.doc?.firstChild;
    if (!first || first.type?.name !== 'code_block' || !isMetadataLanguage(first.attrs?.language)) return {}
    return parseFrontmatter(first.textContent)
}

// A sequence value comes back as its items; a scalar as a single-element array; an
// absent/empty value as an empty array. A quoted scalar that merely looks like a list
// (`"[x]"`) stays literal.
function parseMetadataList(value) {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (!value) return []
    return [value]
}

// The string form of a value that is expected to be a scalar (title, language, ...); a sequence
// written there is joined instead of reaching an XML/document writer as an array.
function metadataScalar(value) {
    return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

const METADATA_BLOCK = new RegExp(`^\\s*<pre><code class="language-${METADATA_LANGUAGE}">[\\s\\S]*?<\\/code><\\/pre>\\s*`);

// MU.getHTML()'s output, unlike the markdown serializer (markupeditor-app/src/serializer.js's
// code_block handler), has no awareness of the metadata convention -- the base editor's
// generic DOMSerializer renders the position-0 metadata code_block exactly like any other
// <pre><code class="language-X">, so it leaks into export output unless stripped here. Mirrors
// serializer.js's rule (doc-root index 0, language "metadata") at the HTML-string level, since
// that's all getHTML() gives a plugin. Metadata is data about the document, not part of it.
function stripMetadataBlock(html) {
    return (html ?? '').replace(METADATA_BLOCK, '')
}

// EPUB3 requires dc:identifier/dc:title/dc:language plus a dcterms:modified <meta> (OPF spec,
// Package Metadata). No filename/title is passed into run() (see MarkupWKWebView+
// Extension.swift's runExporter), so identifier falls back to a freshly generated one and
// title falls back to the document's first heading (htmlToXhtml.js's extractDocumentTitle)
// when metadata doesn't set one.
//
// identifier/title/language are the only fields with dedicated defaulting logic. Every other
// field whose name is a Dublin Core element becomes a <dc:KEY> element; anything else is skipped
// with a warning, since the OPF schema rejects unknown dc: elements.
const RESERVED_KEYS = new Set(['title', 'language', 'lang', 'identifier']);

// The remaining DCMES elements permitted in an OPF <metadata> block.
const DC_ELEMENTS = new Set([
    'contributor', 'coverage', 'creator', 'date', 'description', 'format',
    'publisher', 'relation', 'rights', 'source', 'subject', 'type',
]);

function manifestEntry({ id, href, mediaType, properties }) {
    const props = properties ? ` properties="${properties}"` : '';
    return `    <item id="${id}" href="${escapeXmlAttr(href)}" media-type="${mediaType}"${props}/>`
}

// `images` is the list extractImages.js returned: [{filename, mediaType}, ...], one manifest
// item per real zip entry -- not per <img> tag reuse, so a document that repeats the same image
// still gets one manifest entry per occurrence (see extractImages.js's no-dedup note).
//
// `metadata` is the document's raw frontmatter (extractMetadata), including
// the reserved keys already pulled out into identifier/title/language above -- callers don't
// need to filter it first, buildOpf does that itself so it stays the single place the
// reserved-vs-Dublin-Core split is defined.
function buildOpf({ identifier, title, language = 'en', modified, images = [], metadata = {}, warnings = [] }) {
    const imageItems = images.map((img, i) => manifestEntry({
        id: `img${i + 1}`,
        href: img.filename,
        mediaType: img.mediaType,
    }));

    const extraLines = Object.entries(metadata)
        .filter(([key]) => !RESERVED_KEYS.has(key))
        .flatMap(([key, value]) => {
            if (!DC_ELEMENTS.has(key)) {
                warnings.push(`metadata field "${key}" is not a Dublin Core element, skipped`);
                return []
            }
            return parseMetadataList(value).map((item) => `\n    <dc:${key}>${escapeXmlText(item)}</dc:${key}>`)
        })
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXmlText(identifier)}</dc:identifier>
    <dc:title>${escapeXmlText(title)}</dc:title>${extraLines}
    <dc:language>${escapeXmlText(language)}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${imageItems.join('\n')}${imageItems.length ? '\n' : ''}  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>
`
}

// Builds a nested tree from a flat, level-tagged heading list (htmlToXhtml.js's
// extractHeadings) using a standard TOC-nesting stack: pop back to the nearest ancestor
// shallower than the current heading, then attach. Handles a non-monotonic sequence (e.g. h1
// straight to h3, no h2) by attaching at the nearest existing ancestor rather than assuming
// every level in between is present.
function buildHeadingTree(headings) {
    const root = { level: 0, children: [] };
    const stack = [root];
    for (const heading of headings) {
        while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
        const node = { ...heading, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    }
    return root
}

function serializeTocList(node) {
    if (node.children.length === 0) return ''
    const items = node.children.map((child) => {
        const label = escapeXmlText(child.text);
        const href = `content.xhtml#${escapeXmlAttr(child.id)}`;
        return `<li><a href="${href}">${label}</a>${serializeTocList(child)}</li>`
    });
    return `<ol>${items.join('')}</ol>`
}

// EPUB3 nav document (required by the OPF manifest's properties="nav" item). `headings` comes
// from htmlToXhtml.js's extractHeadings -- when the document has no id-bearing heading at all,
// falls back to a single entry pointing at the whole content document rather than an empty,
// spec-technically-valid-but-useless <nav>.
function buildNavXhtml({ title, headings = [] }) {
    const tree = buildHeadingTree(headings);
    const tocList = headings.length > 0
        ? serializeTocList(tree)
        : `<ol><li><a href="content.xhtml">${escapeXmlText(title)}</a></li></ol>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXmlText(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXmlText(title)}</h1>
    ${tocList}
  </nav>
</body>
</html>
`
}

// The single XHTML content document this exporter produces -- MU.getHTML() carries one
// document body, so one content document is the natural, complete representation ("one or
// more" per the EPUB3 content-document requirement; splitting per-heading into multiple
// chapter files would be a real feature, not something this document's shape needs).
function buildContentXhtml({ title, bodyHtml }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXmlText(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>
`
}

// META-INF/container.xml: the fixed entry point every EPUB reading system looks for first,
// pointing at the OPF package document. OEBPS/content.opf's path is a convention, not a spec
// requirement, but it's the one this exporter always uses, so this file never varies.
const CONTAINER_XML =
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

// Must be the FIRST entry in the zip, stored uncompressed (STORE, not DEFLATE), with no extra
// field -- getting this wrong (compressing it, or an extra field on its local header) is what
// makes some reading systems silently refuse an otherwise-valid EPUB. No trailing newline: the
// spec fixes this file's content exactly.
const MIMETYPE = 'application/epub+zip';

// A minimal default stylesheet so the exported EPUB doesn't render as completely unstyled
// plain text -- most reflowable EPUB reading systems apply their user/theme styles on top of
// this anyway, so this only needs to cover the constructs markup.css gives real visual meaning
// to (table border classes, code font, blockquote indent), not attempt a full port.
// TABLE_BORDER_COLOR matches markup.css's value, same as htmlToDocx.js's TABLE_BORDER_COLOR.
const TABLE_BORDER_COLOR = '#DDD';

const STYLESHEET = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.4;
}
code, pre {
  font-family: "SF Mono", Menlo, Consolas, monospace;
}
pre {
  background-color: #F8F8F8;
  padding: 0.5em;
  overflow-x: auto;
}
code {
  background-color: #F8F8F8;
}
pre code {
  background-color: transparent;
}
blockquote {
  margin-left: 0;
  padding-left: 1em;
  border-left: 3px solid ${TABLE_BORDER_COLOR};
}
img {
  max-width: 100%;
}
table {
  width: 100%;
  border-collapse: collapse;
}
table, th, td {
  border: 1px solid ${TABLE_BORDER_COLOR};
  padding: 0.4em;
}
/* Schema: table cell content is "block+", always at least one <p> -- the browser default
   ~1em top/bottom paragraph margin stacks with the cell's padding above, making every
   cell (even a single short line) render as a tall, sparse-looking row. Zeroed by default;
   a SECOND paragraph in the same cell still gets separation from the one before it. */
td p, th p {
  margin: 0;
}
td p + p, th p + p {
  margin-top: 0.5em;
}
table.bordered-table-none, table.bordered-table-none th, table.bordered-table-none td {
  border: none;
}
table.bordered-table-outer th, table.bordered-table-outer td {
  border: none;
}
table.bordered-table-outer {
  border: 1px solid ${TABLE_BORDER_COLOR};
}
table.bordered-table-header th {
  border: 1px solid ${TABLE_BORDER_COLOR};
}
table.bordered-table-header td {
  border: none;
}
hr {
  border: none;
  border-bottom: 1px solid #000;
}
`;

class EpubExporter {

    async run() {
        const warnings = [];
        try {
            const rawHtml = stripMetadataBlock(MU.getHTML());
            const resolvedHtml = await resolveImages(rawHtml, warnings);
            const { html: htmlWithImagePaths, images } = extractImages(resolvedHtml, warnings);
            const bodyHtml = htmlToXhtmlBody(htmlWithImagePaths, warnings);
            const headings = extractHeadings(htmlWithImagePaths);
            const metadata = extractMetadata(MU);
            // An explicit `title:` in frontmatter wins over the auto-detected first heading --
            // the heading is a fallback for a document that never set one, not an override of
            // one the author gave. Same idea for identifier: a document that pins `identifier:`
            // gets a STABLE identifier across re-exports instead of a fresh urn:uuid: every time.
            const title = metadataScalar(metadata.title) || extractDocumentTitle(rawHtml);
            const language = metadataScalar(metadata.language) || metadataScalar(metadata.lang) || 'en';
            const identifier = metadataScalar(metadata.identifier) || `urn:uuid:${crypto.randomUUID()}`;
            // Truncated to whole seconds ("Z", not ".123Z") -- dcterms:modified's OPF-spec
            // format is CCYY-MM-DDThh:mm:ssZ, no fractional seconds.
            const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

            const encoder = new TextEncoder();
            const zipEntries = {
                // Must be the first key inserted -- zipSync preserves insertion order, and the
                // mimetype entry must be both first and stored (level 0), never deflated, or
                // some reading systems silently refuse the file.
                mimetype: [encoder.encode(MIMETYPE), { level: 0 }],
                'META-INF/container.xml': encoder.encode(CONTAINER_XML),
                'OEBPS/content.opf': encoder.encode(buildOpf({ identifier, title, language, modified, images, metadata, warnings })),
                'OEBPS/nav.xhtml': encoder.encode(buildNavXhtml({ title, headings })),
                'OEBPS/content.xhtml': encoder.encode(buildContentXhtml({ title, bodyHtml })),
                'OEBPS/styles.css': encoder.encode(STYLESHEET),
            };
            for (const image of images) {
                zipEntries[`OEBPS/${image.filename}`] = image.bytes;
            }

            const zipBytes = zipSync(zipEntries);
            return successEnvelope(zipBytes, warnings)
        } catch (error) {
            return failureEnvelope(warnings, 'EPUB', error)
        }
    }
}

const epubExporter = new EpubExporter();

MU.registerPlugin({ name: 'EPUB', type: 'exporter', filename: 'exporter-epub.js', run: epubExporter.run.bind(epubExporter) }, 'EPUB');

export { EpubExporter, epubExporter };
