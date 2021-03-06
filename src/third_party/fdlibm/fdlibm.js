// The following is adapted from fdlibm (http://www.netlib.org/fdlibm),
//
// ====================================================
// Copyright (C) 1993-2004 by Sun Microsystems, Inc. All rights reserved.
//
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================
//
// The original source code covered by the above license above has been
// modified significantly by Google Inc.
// Copyright 2014 the V8 project authors. All rights reserved.
//
// The following is a straightforward translation of fdlibm routines
// by Raymond Toy (rtoy@google.com).

// rempio2result is used as a container for return values of %RemPiO2. It is
// initialized to a two-element Float64Array during genesis.

(function(global, utils) {
  
"use strict";

%CheckIsBootstrapping();

// -------------------------------------------------------------------
// Imports

var GlobalFloat64Array = global.Float64Array;
var GlobalMath = global.Math;
var MathAbs;
var MathExpm1;
var NaN = %GetRootNaN();
var rempio2result;

utils.Import(function(from) {
  MathAbs = from.MathAbs;
  MathExpm1 = from.MathExpm1;
});

utils.CreateDoubleResultArray = function(global) {
  rempio2result = new GlobalFloat64Array(2);
};

// -------------------------------------------------------------------

define INVPIO2 = 6.36619772367581382433e-01;
define PIO2_1  = 1.57079632673412561417;
define PIO2_1T = 6.07710050650619224932e-11;
define PIO2_2  = 6.07710050630396597660e-11;
define PIO2_2T = 2.02226624879595063154e-21;
define PIO2_3  = 2.02226624871116645580e-21;
define PIO2_3T = 8.47842766036889956997e-32;
define PIO4    = 7.85398163397448278999e-01;
define PIO4LO  = 3.06161699786838301793e-17;

// Compute k and r such that x - k*pi/2 = r where |r| < pi/4. For
// precision, r is returned as two values y0 and y1 such that r = y0 + y1
// to more than double precision.

macro REMPIO2(X)
  var n, y0, y1;
  var hx = %_DoubleHi(X);
  var ix = hx & 0x7fffffff;

  if (ix < 0x4002d97c) {
    // |X| ~< 3*pi/4, special case with n = +/- 1
    if (hx > 0) {
      var z = X - PIO2_1;
      if (ix != 0x3ff921fb) {
        // 33+53 bit pi is good enough
        y0 = z - PIO2_1T;
        y1 = (z - y0) - PIO2_1T;
      } else {
        // near pi/2, use 33+33+53 bit pi
        z -= PIO2_2;
        y0 = z - PIO2_2T;
        y1 = (z - y0) - PIO2_2T;
      }
      n = 1;
    } else {
      // Negative X
      var z = X + PIO2_1;
      if (ix != 0x3ff921fb) {
        // 33+53 bit pi is good enough
        y0 = z + PIO2_1T;
        y1 = (z - y0) + PIO2_1T;
      } else {
        // near pi/2, use 33+33+53 bit pi
        z += PIO2_2;
        y0 = z + PIO2_2T;
        y1 = (z - y0) + PIO2_2T;
      }
      n = -1;
    }
  } else if (ix <= 0x413921fb) {
    // |X| ~<= 2^19*(pi/2), medium size
    var t = MathAbs(X);
    n = (t * INVPIO2 + 0.5) | 0;
    var r = t - n * PIO2_1;
    var w = n * PIO2_1T;
    // First round good to 85 bit
    y0 = r - w;
    if (ix - (%_DoubleHi(y0) & 0x7ff00000) > 0x1000000) {
      // 2nd iteration needed, good to 118
      t = r;
      w = n * PIO2_2;
      r = t - w;
      w = n * PIO2_2T - ((t - r) - w);
      y0 = r - w;
      if (ix - (%_DoubleHi(y0) & 0x7ff00000) > 0x3100000) {
        // 3rd iteration needed. 151 bits accuracy
        t = r;
        w = n * PIO2_3;
        r = t - w;
        w = n * PIO2_3T - ((t - r) - w);
        y0 = r - w;
      }
    }
    y1 = (r - y0) - w;
    if (hx < 0) {
      n = -n;
      y0 = -y0;
      y1 = -y1;
    }
  } else {
    // Need to do full Payne-Hanek reduction here.
    n = %RemPiO2(X, rempio2result);
    y0 = rempio2result[0];
    y1 = rempio2result[1];
  }
endmacro


// kernel tan function on [-pi/4, pi/4], pi/4 ~ 0.7854
// Input x is assumed to be bounded by ~pi/4 in magnitude.
// Input y is the tail of x.
// Input k indicates whether ieee_tan (if k = 1) or -1/tan (if k = -1)
// is returned.
//
// Algorithm
//  1. Since ieee_tan(-x) = -ieee_tan(x), we need only to consider positive x.
//  2. if x < 2^-28 (hx<0x3e300000 0), return x with inexact if x!=0.
//  3. ieee_tan(x) is approximated by a odd polynomial of degree 27 on
//     [0,0.67434]
//                           3             27
//          tan(x) ~ x + T1*x + ... + T13*x
//     where
//
//     |ieee_tan(x)    2     4            26   |     -59.2
//     |----- - (1+T1*x +T2*x +.... +T13*x    )| <= 2
//     |  x                                    |
//
//     Note: ieee_tan(x+y) = ieee_tan(x) + tan'(x)*y
//                    ~ ieee_tan(x) + (1+x*x)*y
//     Therefore, for better accuracy in computing ieee_tan(x+y), let
//               3      2      2       2       2
//          r = x *(T2+x *(T3+x *(...+x *(T12+x *T13))))
//     then
//                              3    2
//          tan(x+y) = x + (T1*x + (x *(r+y)+y))
//
//  4. For x in [0.67434,pi/4],  let y = pi/4 - x, then
//          tan(x) = ieee_tan(pi/4-y) = (1-ieee_tan(y))/(1+ieee_tan(y))
//                 = 1 - 2*(ieee_tan(y) - (ieee_tan(y)^2)/(1+ieee_tan(y)))
//
// Set returnTan to 1 for tan; -1 for cot.  Anything else is illegal
// and will cause incorrect results.
//
define T00 = 3.33333333333334091986e-01;
define T01 = 1.33333333333201242699e-01;
define T02 = 5.39682539762260521377e-02;
define T03 = 2.18694882948595424599e-02;
define T04 = 8.86323982359930005737e-03;
define T05 = 3.59207910759131235356e-03;
define T06 = 1.45620945432529025516e-03;
define T07 = 5.88041240820264096874e-04;
define T08 = 2.46463134818469906812e-04;
define T09 = 7.81794442939557092300e-05;
define T10 = 7.14072491382608190305e-05;
define T11 = -1.85586374855275456654e-05;
define T12 = 2.59073051863633712884e-05;

function KernelTan(x, y, returnTan) {
  var z;
  var w;
  var hx = %_DoubleHi(x);
  var ix = hx & 0x7fffffff;

  if (ix < 0x3e300000) {  // |x| < 2^-28
    if (((ix | %_DoubleLo(x)) | (returnTan + 1)) == 0) {
      // x == 0 && returnTan = -1
      return 1 / MathAbs(x);
    } else {
      if (returnTan == 1) {
        return x;
      } else {
        // Compute -1/(x + y) carefully
        var w = x + y;
        var z = %_ConstructDouble(%_DoubleHi(w), 0);
        var v = y - (z - x);
        var a = -1 / w;
        var t = %_ConstructDouble(%_DoubleHi(a), 0);
        var s = 1 + t * z;
        return t + a * (s + t * v);
      }
    }
  }
  if (ix >= 0x3fe59428) {  // |x| > .6744
    if (x < 0) {
      x = -x;
      y = -y;
    }
    z = PIO4 - x;
    w = PIO4LO - y;
    x = z + w;
    y = 0;
  }
  z = x * x;
  w = z * z;

  // Break x^5 * (T1 + x^2*T2 + ...) into
  // x^5 * (T1 + x^4*T3 + ... + x^20*T11) +
  // x^5 * (x^2 * (T2 + x^4*T4 + ... + x^22*T12))
  var r = T01 + w * (T03 + w * (T05 +
                w * (T07 + w * (T09 + w * T11))));
  var v = z * (T02 + w * (T04 + w * (T06 +
                     w * (T08 + w * (T10 + w * T12)))));
  var s = z * x;
  r = y + z * (s * (r + v) + y);
  r = r + T00 * s;
  w = x + r;
  if (ix >= 0x3fe59428) {
    return (1 - ((hx >> 30) & 2)) *
      (returnTan - 2.0 * (x - (w * w / (w + returnTan) - r)));
  }
  if (returnTan == 1) {
    return w;
  } else {
    z = %_ConstructDouble(%_DoubleHi(w), 0);
    v = r - (z - x);
    var a = -1 / w;
    var t = %_ConstructDouble(%_DoubleHi(a), 0);
    s = 1 + t * z;
    return t + a * (s + t * v);
  }
}

// ECMA 262 - 15.8.2.18
function MathTan(x) {
  x = x * 1;  // Convert to number.
  if ((%_DoubleHi(x) & 0x7fffffff) <= 0x3fe921fb) {
    // |x| < pi/4, approximately.  No reduction needed.
    return KernelTan(x, 0, 1);
  }
  REMPIO2(x);
  return KernelTan(y0, y1, (n & 1) ? -1 : 1);
}

define LN2_HI    = 6.93147180369123816490e-01;
define LN2_LO    = 1.90821492927058770002e-10;

// 2^54
define TWO54 = 18014398509481984;

// ES6 draft 09-27-13, section 20.2.2.30.
// Math.sinh
// Method :
// mathematically sinh(x) if defined to be (exp(x)-exp(-x))/2
//      1. Replace x by |x| (sinh(-x) = -sinh(x)).
//      2.
//                                                  E + E/(E+1)
//          0        <= x <= 22     :  sinh(x) := --------------, E=expm1(x)
//                                                      2
//
//          22       <= x <= lnovft :  sinh(x) := exp(x)/2 
//          lnovft   <= x <= ln2ovft:  sinh(x) := exp(x/2)/2 * exp(x/2)
//          ln2ovft  <  x           :  sinh(x) := x*shuge (overflow)
//
// Special cases:
//      sinh(x) is |x| if x is +Infinity, -Infinity, or NaN.
//      only sinh(0)=0 is exact for finite x.
//
define KSINH_OVERFLOW = 710.4758600739439;
define TWO_M28 = 3.725290298461914e-9;  // 2^-28, empty lower half
define LOG_MAXD = 709.7822265625;  // 0x40862e42 00000000, empty lower half

function MathSinh(x) {
  x = x * 1;  // Convert to number.
  var h = (x < 0) ? -0.5 : 0.5;
  // |x| in [0, 22]. return sign(x)*0.5*(E+E/(E+1))
  var ax = MathAbs(x);
  if (ax < 22) {
    // For |x| < 2^-28, sinh(x) = x
    if (ax < TWO_M28) return x;
    var t = MathExpm1(ax);
    if (ax < 1) return h * (2 * t - t * t / (t + 1));
    return h * (t + t / (t + 1));
  }
  // |x| in [22, log(maxdouble)], return 0.5 * exp(|x|)
  if (ax < LOG_MAXD) return h * %math_exp(ax);
  // |x| in [log(maxdouble), overflowthreshold]
  // overflowthreshold = 710.4758600739426
  if (ax <= KSINH_OVERFLOW) {
    var w = %math_exp(0.5 * ax);
    var t = h * w;
    return t * w;
  }
  // |x| > overflowthreshold or is NaN.
  // Return Infinity of the appropriate sign or NaN.
  return x * INFINITY;
}


// ES6 draft 09-27-13, section 20.2.2.12.
// Math.cosh
// Method : 
// mathematically cosh(x) if defined to be (exp(x)+exp(-x))/2
//      1. Replace x by |x| (cosh(x) = cosh(-x)). 
//      2.
//                                                      [ exp(x) - 1 ]^2 
//          0        <= x <= ln2/2  :  cosh(x) := 1 + -------------------
//                                                         2*exp(x)
//
//                                                 exp(x) + 1/exp(x)
//          ln2/2    <= x <= 22     :  cosh(x) := -------------------
//                                                        2
//          22       <= x <= lnovft :  cosh(x) := exp(x)/2 
//          lnovft   <= x <= ln2ovft:  cosh(x) := exp(x/2)/2 * exp(x/2)
//          ln2ovft  <  x           :  cosh(x) := huge*huge (overflow)
//
// Special cases:
//      cosh(x) is |x| if x is +INF, -INF, or NaN.
//      only cosh(0)=1 is exact for finite x.
//
define KCOSH_OVERFLOW = 710.4758600739439;

function MathCosh(x) {
  x = x * 1;  // Convert to number.
  var ix = %_DoubleHi(x) & 0x7fffffff;
  // |x| in [0,0.5*log2], return 1+expm1(|x|)^2/(2*exp(|x|))
  if (ix < 0x3fd62e43) {
    var t = MathExpm1(MathAbs(x));
    var w = 1 + t;
    // For |x| < 2^-55, cosh(x) = 1
    if (ix < 0x3c800000) return w;
    return 1 + (t * t) / (w + w);
  }
  // |x| in [0.5*log2, 22], return (exp(|x|)+1/exp(|x|)/2
  if (ix < 0x40360000) {
    var t = %math_exp(MathAbs(x));
    return 0.5 * t + 0.5 / t;
  }
  // |x| in [22, log(maxdouble)], return half*exp(|x|)
  if (ix < 0x40862e42) return 0.5 * %math_exp(MathAbs(x));
  // |x| in [log(maxdouble), overflowthreshold]
  if (MathAbs(x) <= KCOSH_OVERFLOW) {
    var w = %math_exp(0.5 * MathAbs(x));
    var t = 0.5 * w;
    return t * w;
  }
  if (NUMBER_IS_NAN(x)) return x;
  // |x| > overflowthreshold.
  return INFINITY;
}

// ES6 draft 09-27-13, section 20.2.2.33.
// Math.tanh(x)
// Method :
//                                    x    -x
//                                   e  - e
//     0. tanh(x) is defined to be -----------
//                                    x    -x
//                                   e  + e
//     1. reduce x to non-negative by tanh(-x) = -tanh(x).
//     2.  0      <= x <= 2**-55 : tanh(x) := x*(one+x)
//                                             -t
//         2**-55 <  x <=  1     : tanh(x) := -----; t = expm1(-2x)
//                                            t + 2
//                                                  2
//         1      <= x <=  22.0  : tanh(x) := 1-  ----- ; t = expm1(2x)
//                                                t + 2
//         22.0   <  x <= INF    : tanh(x) := 1.
//
// Special cases:
//     tanh(NaN) is NaN;
//     only tanh(0) = 0 is exact for finite argument.
//

define TWO_M55 = 2.77555756156289135105e-17;  // 2^-55, empty lower half

function MathTanh(x) {
  x = x * 1;  // Convert to number.
  // x is Infinity or NaN
  if (!NUMBER_IS_FINITE(x)) {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return x;
  }

  var ax = MathAbs(x);
  var z;
  // |x| < 22
  if (ax < 22) {
    if (ax < TWO_M55) {
      // |x| < 2^-55, tanh(small) = small.
      return x;
    }
    if (ax >= 1) {
      // |x| >= 1
      var t = MathExpm1(2 * ax);
      z = 1 - 2 / (t + 2);
    } else {
      var t = MathExpm1(-2 * ax);
      z = -t / (t + 2);
    }
  } else {
    // |x| > 22, return +/- 1
    z = 1;
  }
  return (x >= 0) ? z : -z;
}

//-------------------------------------------------------------------

utils.InstallFunctions(GlobalMath, DONT_ENUM, [
  "tan", MathTan,
  "sinh", MathSinh,
  "cosh", MathCosh,
  "tanh", MathTanh
]);

})
